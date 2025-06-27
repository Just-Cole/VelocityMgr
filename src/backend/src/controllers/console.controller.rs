use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin};
use std::sync::{Arc, Mutex};
use actix_web::{web, HttpResponse, Responder};
use tokio::fs::{self, File};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use thiserror::Error;
use serde::{Serialize, Deserialize};

#[derive(Debug, Error)]
pub enum ConsoleError {
    #[error("Server not found")]
    ServerNotFound,
    #[error("Console log file not configured")]
    LogFileNotConfigured,
    #[error("Console log file not found")]
    LogFileNotFound,
    #[error("Invalid command")]
    InvalidCommand,
    #[error("Server not in correct state: {0}")]
    InvalidServerState(String),
    #[error("Process input not available")]
    ProcessInputUnavailable,
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Internal server error")]
    InternalError,
}

impl actix_web::error::ResponseError for ConsoleError {
    fn status_code(&self) -> actix_web::http::StatusCode {
        match self {
            ConsoleError::ServerNotFound | ConsoleError::LogFileNotFound => {
                actix_web::http::StatusCode::NOT_FOUND
            }
            ConsoleError::InvalidCommand | ConsoleError::InvalidServerState(_) => {
                actix_web::http::StatusCode::BAD_REQUEST
            }
            ConsoleError::ProcessInputUnavailable => actix_web::http::StatusCode::CONFLICT,
            _ => actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> actix_web::HttpResponse {
        HttpResponse::build(self.status_code())
            .json(serde_json::json!({ "message": self.to_string() }))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Server {
    pub id: String,
    pub name: String,
    pub status: String,
    pub console_log_file: Option<PathBuf>,
    pub pid: Option<u32>,
}

#[derive(Debug)]
pub struct ServerProcess {
    pub child: Child,
    pub recovered: bool,
}

#[derive(Clone)]
pub struct ConsoleController {
    servers: Arc<Mutex<Vec<Server>>>,
    active_processes: Arc<Mutex<HashMap<String, ServerProcess>>>,
}

impl ConsoleController {
    pub fn new(
        servers: Arc<Mutex<Vec<Server>>>,
        active_processes: Arc<Mutex<HashMap<String, ServerProcess>>>,
    ) -> Self {
        ConsoleController {
            servers,
            active_processes,
        }
    }

    fn get_server(&self, server_id: &str) -> Result<Server, ConsoleError> {
        let servers = self.servers.lock().unwrap();
        servers
            .iter()
            .find(|s| s.id == server_id)
            .cloned()
            .ok_or(ConsoleError::ServerNotFound)
    }

    pub async fn get_live_console(
        &self,
        server_id: &str,
        char_offset: u64,
    ) -> Result<ConsoleResponse, ConsoleError> {
        let server = self.get_server(server_id)?;
        let current_status = server.status.clone();

        // Check server status
        if current_status == "Offline" || current_status == "Stopping" {
            return Ok(ConsoleResponse {
                logs: format!("\n--- Server is {}. Console inactive. ---\n", current_status),
                new_offset: char_offset,
                status: current_status,
            });
        }

        // Check log file configuration
        let log_file = server
            .console_log_file
            .as_ref()
            .ok_or(ConsoleError::LogFileNotConfigured)?;

        if !log_file.exists() {
            if current_status == "Starting" || current_status == "Online" || current_status == "Restarting" {
                return Ok(ConsoleResponse {
                    logs: "--- Console log file not yet created or server not fully started. ---\n".to_string(),
                    new_offset: 0,
                    status: current_status,
                });
            } else {
                return Ok(ConsoleResponse {
                    logs: format!("\n--- Server is {}. Console may be stale. ---\n", current_status),
                    new_offset: char_offset,
                    status: current_status,
                });
            }
        }

        // Get file size
        let metadata = fs::metadata(&log_file).await?;
        let total_size = metadata.len();

        if char_offset >= total_size {
            if current_status != "Starting" && current_status != "Online" && current_status != "Restarting" {
                return Ok(ConsoleResponse {
                    logs: format!("\n--- Server is {}. Console may be stale. ---\n", current_status),
                    new_offset: total_size,
                    status: current_status,
                });
            } else {
                return Ok(ConsoleResponse {
                    logs: String::new(),
                    new_offset: total_size,
                    status: current_status,
                });
            }
        }

        // Read new content
        let mut file = File::open(&log_file).await?;
        file.seek(std::io::SeekFrom::Start(char_offset)).await?;

        let mut buffer = Vec::with_capacity((total_size - char_offset) as usize);
        file.read_to_end(&mut buffer).await?;

        let new_content = String::from_utf8(buffer).map_err(|_| ConsoleError::InternalError)?;

        Ok(ConsoleResponse {
            logs: new_content,
            new_offset: total_size,
            status: current_status,
        })
    }

    pub async fn get_full_log(&self, server_id: &str) -> Result<String, ConsoleError> {
        let server = self.get_server(server_id)?;
        let log_file = server
            .console_log_file
            .as_ref()
            .ok_or(ConsoleError::LogFileNotConfigured)?;

        if !log_file.exists() {
            return Err(ConsoleError::LogFileNotFound);
        }

        let content = fs::read_to_string(&log_file).await?;
        Ok(content)
    }

    pub async fn send_command(
        &self,
        server_id: &str,
        command: &str,
    ) -> Result<(), ConsoleError> {
        // Validate command
        let trimmed = command.trim();
        if trimmed.is_empty() {
            return Err(ConsoleError::InvalidCommand);
        }

        // Check server status
        let server = self.get_server(server_id)?;
        let allowed_statuses = ["Online", "Starting", "Restarting"];
        if !allowed_statuses.contains(&server.status.as_str()) {
            return Err(ConsoleError::InvalidServerState(server.status));
        }

        // Get process
        let mut processes = self.active_processes.lock().unwrap();
        let process = processes
            .get_mut(server_id)
            .ok_or(ConsoleError::ProcessInputUnavailable)?;

        // Check if recovered process
        if process.recovered && process.child.stdin.is_none() {
            return Err(ConsoleError::ProcessInputUnavailable);
        }

        // Send command
        if let Some(stdin) = &mut process.child.stdin {
            stdin
                .write_all(format!("{}\n", trimmed).as_bytes())
                .map_err(|_| ConsoleError::ProcessInputUnavailable)?;
            Ok(())
        } else {
            Err(ConsoleError::ProcessInputUnavailable)
        }
    }
}

// Response types
#[derive(Debug, Serialize)]
pub struct ConsoleResponse {
    pub logs: String,
    pub new_offset: u64,
    pub status: String,
}

// Handler functions for Actix-web
pub async fn handle_live_console(
    console_controller: web::Data<ConsoleController>,
    server_id: web::Path<String>,
    query: web::Query<HashMap<String, String>>,
) -> Result<HttpResponse, ConsoleError> {
    let offset = query
        .get("offset")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let response = console_controller
        .get_live_console(&server_id, offset)
        .await?;

    Ok(HttpResponse::Ok().json(response))
}

pub async fn handle_full_log(
    console_controller: web::Data<ConsoleController>,
    server_id: web::Path<String>,
) -> Result<HttpResponse, ConsoleError> {
    let content = console_controller.get_full_log(&server_id).await?;
    Ok(HttpResponse::Ok()
        .content_type("text/plain")
        .body(content))
}

pub async fn handle_send_command(
    console_controller: web::Data<ConsoleController>,
    server_id: web::Path<String>,
    payload: web::Json<HashMap<String, String>>,
) -> Result<HttpResponse, ConsoleError> {
    let command = payload
        .get("command")
        .ok_or(ConsoleError::InvalidCommand)?;

    console_controller
        .send_command(&server_id, command)
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": format!("Command \"{}\" sent.", command.trim())
    })))
}