use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use actix_web::{web, HttpResponse, Responder};
use tokio::fs::{self, File};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use serde::{Serialize, Deserialize};
use thiserror::Error;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use toml::{self, value::Table};
use reqwest;
use tempfile::tempdir;
use zip::ZipArchive;

#[derive(Debug, Error)]
pub enum ServerError {
    #[error("Server not found")]
    ServerNotFound,
    #[error("Invalid port")]
    InvalidPort,
    #[error("Server already exists")]
    ServerExists,
    #[error("Server is not in correct state")]
    InvalidServerState,
    #[error("Process not found")]
    ProcessNotFound,
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("TOML error: {0}")]
    TomlError(#[from] toml::de::Error),
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Reqwest error: {0}")]
    ReqwestError(#[from] reqwest::Error),
    #[error("Zip error: {0}")]
    ZipError(#[from] zip::result::ZipError),
    #[error("Missing required field: {0}")]
    MissingField(String),
    #[error("Internal server error")]
    InternalError,
}

impl actix_web::error::ResponseError for ServerError {
    fn status_code(&self) -> actix_web::http::StatusCode {
        match self {
            ServerError::ServerNotFound => actix_web::http::StatusCode::NOT_FOUND,
            ServerError::ServerExists => actix_web::http::StatusCode::CONFLICT,
            ServerError::InvalidPort | ServerError::MissingField(_) => {
                actix_web::http::StatusCode::BAD_REQUEST
            }
            ServerError::InvalidServerState | ServerError::ProcessNotFound => {
                actix_web::http::StatusCode::BAD_REQUEST
            }
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
    pub port: u16,
    pub ip: String,
    pub software_type: String,
    pub server_version: String,
    pub paper_build: Option<u32>,
    pub velocity_build: Option<u32>,
    pub status: String,
    pub connected_players: Vec<String>,
    pub max_players: u32,
    pub min_ram: String,
    pub max_ram: String,
    pub description: String,
    pub tags: Vec<String>,
    pub jar_file_name: Option<String>,
    pub pid: Option<u32>,
    pub console_log_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerProperties {
    #[serde(flatten)]
    pub properties: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct ServerProcess {
    pub child: Child,
    pub log_file: File,
}

#[derive(Clone)]
pub struct ServerController {
    servers: Arc<Mutex<Vec<Server>>>,
    active_processes: Arc<Mutex<HashMap<String, ServerProcess>>>,
    base_path: PathBuf,
    config: Arc<Mutex<Config>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub default_min_ram: String,
    pub default_max_ram: String,
    pub java_executable_path: String,
}

impl ServerController {
    pub fn new(
        servers: Arc<Mutex<Vec<Server>>>,
        config: Arc<Mutex<Config>>,
        base_path: impl AsRef<Path>,
    ) -> Self {
        ServerController {
            servers,
            active_processes: Arc::new(Mutex::new(HashMap::new())),
            base_path: base_path.as_ref().to_path_buf(),
            config,
        }
    }

    fn get_server(&self, server_id: &str) -> Result<Server, ServerError> {
        let servers = self.servers.lock().unwrap();
        servers
            .iter()
            .find(|s| s.id == server_id)
            .cloned()
            .ok_or(ServerError::ServerNotFound)
    }

    fn get_server_mut(&self, server_id: &str) -> Result<Server, ServerError> {
        let mut servers = self.servers.lock().unwrap();
        let index = servers
            .iter()
            .position(|s| s.id == server_id)
            .ok_or(ServerError::ServerNotFound)?;
        Ok(servers[index].clone())
    }

    fn update_server(&self, server: Server) -> Result<(), ServerError> {
        let mut servers = self.servers.lock().unwrap();
        let index = servers
            .iter()
            .position(|s| s.id == server.id)
            .ok_or(ServerError::ServerNotFound)?;
        servers[index] = server;
        Ok(())
    }

    fn get_server_folder_path(&self, server: &Server) -> PathBuf {
        self.base_path.join("servers").join(&server.id)
    }

    fn validate_path(&self, base: &Path, test: &Path) -> Result<(), ServerError> {
        if test.starts_with(base) {
            Ok(())
        } else {
            Err(ServerError::InvalidPort)
        }
    }

    pub async fn list_servers(&self) -> Result<Vec<Server>, ServerError> {
        let servers = self.servers.lock().unwrap();
        Ok(servers.clone())
    }

    pub async fn create_server(
        &self,
        name: &str,
        port: u16,
        server_type: &str,
        server_version: Option<&str>,
    ) -> Result<Server, ServerError> {
        let mut servers = self.servers.lock().unwrap();

        if servers.iter().any(|s| s.name == name || s.port == port) {
            return Err(ServerError::ServerExists);
        }

        let is_paper = server_type == "PaperMC";
        let api_project_name = if is_paper { "paper" } else { "velocity" };

        let version = match server_version {
            Some(v) => v.to_string(),
            None => {
                let url = format!("https://api.papermc.io/v2/projects/{api_project_name}");
                let response = reqwest::get(&url).await?.json::<serde_json::Value>().await?;
                let versions = response["versions"]
                    .as_array()
                    .ok_or(ServerError::InternalError)?;
                versions
                    .last()
                    .ok_or(ServerError::InternalError)?
                    .as_str()
                    .ok_or(ServerError::InternalError)?
                    .to_string()
            }
        };

        let builds_url = format!(
            "https://api.papermc.io/v2/projects/{api_project_name}/versions/{version}/builds"
        );
        let builds_response = reqwest::get(&builds_url)
            .await?
            .json::<serde_json::Value>()
            .await?;
        let latest_build = builds_response["builds"]
            .as_array()
            .ok_or(ServerError::InternalError)?
            .last()
            .ok_or(ServerError::InternalError)?;
        let build_number = latest_build["build"]
            .as_u64()
            .ok_or(ServerError::InternalError)? as u32;

        let new_server = Server {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            port,
            ip: "127.0.0.1".to_string(),
            software_type: server_type.to_string(),
            server_version: version.clone(),
            paper_build: if is_paper { Some(build_number) } else { None },
            velocity_build: if !is_paper { Some(build_number) } else { None },
            status: "Offline".to_string(),
            connected_players: Vec::new(),
            max_players: 20,
            min_ram: self
                .config
                .lock()
                .unwrap()
                .default_min_ram
                .clone()
                .unwrap_or("1024M".to_string()),
            max_ram: self
                .config
                .lock()
                .unwrap()
                .default_max_ram
                .clone()
                .unwrap_or("2048M".to_string()),
            description: format!("A new {server_type} server."),
            tags: Vec::new(),
            jar_file_name: None,
            pid: None,
            console_log_file: None,
        };

        let server_folder = self.get_server_folder_path(&new_server);
        fs::create_dir_all(&server_folder).await?;

        let download_file_name = format!("{api_project_name}-{version}-{build_number}.jar");
        let server_jar_path = server_folder.join(&download_file_name);

        if !server_jar_path.exists() {
            let download_url = format!(
                "https://api.papermc.io/v2/projects/{api_project_name}/versions/{version}/builds/{build_number}/downloads/{download_file_name}"
            );
            self.download_file(&download_url, &server_folder, &download_file_name)
                .await?;
        }

        let mut new_server = new_server;
        new_server.jar_file_name = Some(download_file_name);

        // Create eula.txt
        fs::write(server_folder.join("eula.txt"), "eula=true").await?;

        if is_paper {
            self.update_server_properties_port(&new_server, new_server.port)
                .await?;
        } else {
            let toml_path = server_folder.join("velocity.toml");
            if !toml_path.exists() {
                let mut toml_content = toml::from_str::<Table>(include_str!("velocity.toml"))?;
                toml_content["bind"] = toml::Value::String(format!("0.0.0.0:{}", new_server.port));
                fs::write(toml_path, toml::to_string(&toml_content)?).await?;

                let secret = rand::random::<[u8; 12]>();
                fs::write(
                    server_folder.join("forwarding.secret"),
                    hex::encode(secret),
                )
                .await?;
            }
        }

        servers.push(new_server.clone());
        Ok(new_server)
    }

    async fn download_file(
        &self,
        url: &str,
        destination_dir: &Path,
        file_name: &str,
    ) -> Result<(), ServerError> {
        let response = reqwest::get(url).await?;
        let content = response.bytes().await?;
        fs::create_dir_all(destination_dir).await?;
        fs::write(destination_dir.join(file_name), content).await?;
        Ok(())
    }

    async fn update_server_properties_port(
        &self,
        server: &Server,
        new_port: u16,
    ) -> Result<(), ServerError> {
        let server_folder = self.get_server_folder_path(server);
        let props_path = server_folder.join("server.properties");

        let mut props = if props_path.exists() {
            let content = fs::read_to_string(&props_path).await?;
            Self::parse_server_properties(&content)
        } else {
            HashMap::new()
        };

        props.insert("server-port".to_string(), new_port.to_string());
        let new_content = Self::format_server_properties(&props);
        fs::write(props_path, new_content).await?;
        Ok(())
    }

    fn parse_server_properties(content: &str) -> HashMap<String, String> {
        let mut properties = HashMap::new();
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, value)) = line.split_once('=') {
                properties.insert(key.trim().to_string(), value.trim().to_string());
            }
        }
        properties
    }

    fn format_server_properties(properties: &HashMap<String, String>) -> String {
        properties
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join("\n")
    }

    pub async fn start_server(&self, server_id: &str) -> Result<Server, ServerError> {
        let mut server = self.get_server_mut(server_id)?;
        let server_folder = self.get_server_folder_path(&server);

        // Check if server is already running
        if self.active_processes.lock().unwrap().contains_key(server_id) {
            return Err(ServerError::InvalidServerState);
        }

        // Ensure JAR exists
        let jar_path = match &server.jar_file_name {
            Some(name) => server_folder.join(name),
            None => return Err(ServerError::InternalError),
        };

        if !jar_path.exists() {
            return Err(ServerError::InternalError);
        }

        // Create eula.txt if it doesn't exist
        let eula_path = server_folder.join("eula.txt");
        if !eula_path.exists() {
            fs::write(eula_path, "eula=true").await?;
        }

        // Create console log file
        let console_log_path = server_folder.join("live_console.log");
        server.console_log_file = Some(console_log_path.to_string_lossy().to_string());
        self.update_server(server.clone())?;

        let log_file = File::create(&console_log_path).await?;

        // Start the server process
        let config = self.config.lock().unwrap();
        let java_path = config.java_executable_path.as_str();

        let mut command = Command::new(java_path);
        command
            .arg(format!("-Xms{}", server.min_ram))
            .arg(format!("-Xmx{}", server.max_ram))
            .arg("-jar")
            .arg(jar_path.file_name().unwrap())
            .current_dir(&server_folder);

        if server.software_type == "PaperMC" {
            command.arg("--nogui");
        }

        let child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        // Update server status
        server.status = "Starting".to_string();
        server.pid = Some(child.id() as u32);
        self.update_server(server.clone())?;

        // Store the process
        self.active_processes.lock().unwrap().insert(
            server_id.to_string(),
            ServerProcess {
                child,
                log_file,
            },
        );

        Ok(server)
    }

    pub async fn stop_server(&self, server_id: &str) -> Result<Server, ServerError> {
        let mut server = self.get_server_mut(server_id)?;
        
        // Check if server is running
        let mut processes = self.active_processes.lock().unwrap();
        let process = processes.get_mut(server_id).ok_or(ServerError::ProcessNotFound)?;

        // Update server status
        server.status = "Stopping".to_string();
        self.update_server(server.clone())?;

        // Send stop command
        if let Some(stdin) = &mut process.child.stdin {
            use std::io::Write;
            stdin.write_all(b"stop\n")?;
        } else {
            process.child.kill()?;
        }

        Ok(server)
    }

    pub async fn restart_server(&self, server_id: &str) -> Result<Server, ServerError> {
        let server = self.get_server_mut(server_id)?;
        
        if self.active_processes.lock().unwrap().contains_key(server_id) {
            self.stop_server(server_id).await?;
            // In a real implementation, you'd want to wait for the server to actually stop
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
        
        self.start_server(server_id).await
    }

    pub async fn get_server_properties(
        &self,
        server_id: &str,
    ) -> Result<HashMap<String, String>, ServerError> {
        let server = self.get_server(server_id)?;
        if server.software_type == "Velocity" {
            return Err(ServerError::InvalidServerState);
        }

        let props_path = self.get_server_folder_path(&server).join("server.properties");
        if !props_path.exists() {
            return Ok(HashMap::new());
        }

        let content = fs::read_to_string(props_path).await?;
        Ok(Self::parse_server_properties(&content))
    }

    pub async fn update_server_properties(
        &self,
        server_id: &str,
        properties: HashMap<String, String>,
    ) -> Result<(), ServerError> {
        let server = self.get_server(server_id)?;
        if server.software_type == "Velocity" {
            return Err(ServerError::InvalidServerState);
        }

        let props_path = self.get_server_folder_path(&server).join("server.properties");
        let content = Self::format_server_properties(&properties);
        fs::write(props_path, content).await?;
        Ok(())
    }

    pub async fn get_velocity_toml(&self, server_id: &str) -> Result<Table, ServerError> {
        let server = self.get_server(server_id)?;
        if server.software_type != "Velocity" {
            return Err(ServerError::InvalidServerState);
        }

        let toml_path = self.get_server_folder_path(&server).join("velocity.toml");
        if !toml_path.exists() {
            return Ok(Table::new());
        }

        let content = fs::read_to_string(toml_path).await?;
        Ok(toml::from_str(&content)?)
    }

    pub async fn update_velocity_toml(
        &self,
        server_id: &str,
        toml_data: Table,
    ) -> Result<(), ServerError> {
        let server = self.get_server(server_id)?;
        if server.software_type != "Velocity" {
            return Err(ServerError::InvalidServerState);
        }

        let toml_path = self.get_server_folder_path(&server).join("velocity.toml");
        let content = toml::to_string(&toml_data)?;
        fs::write(toml_path, content).await?;
        Ok(())
    }
}

// Handler functions for Actix-web
pub async fn handle_list_servers(
    controller: web::Data<ServerController>,
) -> Result<HttpResponse, ServerError> {
    let servers = controller.list_servers().await?;
    Ok(HttpResponse::Ok().json(servers))
}

pub async fn handle_create_server(
    controller: web::Data<ServerController>,
    payload: web::Json<HashMap<String, String>>,
) -> Result<HttpResponse, ServerError> {
    let name = payload
        .get("name")
        .ok_or(ServerError::MissingField("name".to_string()))?;
    let port = payload
        .get("port")
        .ok_or(ServerError::MissingField("port".to_string()))?
        .parse()
        .map_err(|_| ServerError::InvalidPort)?;
    let server_type = payload
        .get("serverType")
        .ok_or(ServerError::MissingField("serverType".to_string()))?;
    let server_version = payload.get("serverVersion");

    let server = controller
        .create_server(name, port, server_type, server_version.map(|s| s.as_str()))
        .await?;

    Ok(HttpResponse::Created().json(server))
}

pub async fn handle_start_server(
    controller: web::Data<ServerController>,
    server_id: web::Path<String>,
) -> Result<HttpResponse, ServerError> {
    let server = controller.start_server(&server_id).await?;
    Ok(HttpResponse::Ok().json(server))
}

pub async fn handle_stop_server(
    controller: web::Data<ServerController>,
    server_id: web::Path<String>,
) -> Result<HttpResponse, ServerError> {
    let server = controller.stop_server(&server_id).await?;
    Ok(HttpResponse::Ok().json(server))
}

pub async fn handle_restart_server(
    controller: web::Data<ServerController>,
    server_id: web::Path<String>,
) -> Result<HttpResponse, ServerError> {
    let server = controller.restart_server(&server_id).await?;
    Ok(HttpResponse::Ok().json(server))
}

pub async fn handle_get_server_properties(
    controller: web::Data<ServerController>,
    server_id: web::Path<String>,
) -> Result<HttpResponse, ServerError> {
    let properties = controller.get_server_properties(&server_id).await?;
    Ok(HttpResponse::Ok().json(properties))
}

pub async fn handle_update_server_properties(
    controller: web::Data<ServerController>,
    server_id: web::Path<String>,
    payload: web::Json<HashMap<String, String>>,
) -> Result<HttpResponse, ServerError> {
    controller
        .update_server_properties(&server_id, payload.into_inner())
        .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Server properties updated successfully"
    })))
}

pub async fn handle_get_velocity_toml(
    controller: web::Data<ServerController>,
    server_id: web::Path<String>,
) -> Result<HttpResponse, ServerError> {
    let toml = controller.get_velocity_toml(&server_id).await?;
    Ok(HttpResponse::Ok().json(toml))
}

pub async fn handle_update_velocity_toml(
    controller: web::Data<ServerController>,
    server_id: web::Path<String>,
    payload: web::Json<Table>,
) -> Result<HttpResponse, ServerError> {
    controller
        .update_velocity_toml(&server_id, payload.into_inner())
        .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Velocity TOML updated successfully"
    })))
}