use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use actix_web::{web, HttpResponse, Responder};
use tokio::fs::{self, File, DirEntry};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use serde::{Serialize, Deserialize};
use thiserror::Error;
use chrono::{DateTime, Utc};
use base64::{Engine as _, engine::general_purpose};

#[derive(Debug, Error)]
pub enum FileError {
    #[error("Server not found")]
    ServerNotFound,
    #[error("Path not found")]
    PathNotFound,
    #[error("Invalid path")]
    InvalidPath,
    #[error("Not a file")]
    NotAFile,
    #[error("Not a directory")]
    NotADirectory,
    #[error("Missing required field: {0}")]
    MissingField(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Internal server error")]
    InternalError,
}

impl actix_web::error::ResponseError for FileError {
    fn status_code(&self) -> actix_web::http::StatusCode {
        match self {
            FileError::ServerNotFound | FileError::PathNotFound => {
                actix_web::http::StatusCode::NOT_FOUND
            }
            FileError::InvalidPath | FileError::MissingField(_) => {
                actix_web::http::StatusCode::BAD_REQUEST
            }
            FileError::NotAFile | FileError::NotADirectory => {
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
    // Add other server fields as needed
}

#[derive(Debug, Serialize)]
pub struct FileItem {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub path: String,
    pub size: String,
    pub last_modified: DateTime<Utc>,
    pub server_id: String,
}

#[derive(Clone)]
pub struct FileController {
    servers: Arc<Mutex<Vec<Server>>>,
    base_path: PathBuf,
}

impl FileController {
    pub fn new(servers: Arc<Mutex<Vec<Server>>>, base_path: impl AsRef<Path>) -> Self {
        FileController {
            servers,
            base_path: base_path.as_ref().to_path_buf(),
        }
    }

    fn get_server(&self, server_id: &str) -> Result<Server, FileError> {
        let servers = self.servers.lock().unwrap();
        servers
            .iter()
            .find(|s| s.id == server_id)
            .cloned()
            .ok_or(FileError::ServerNotFound)
    }

    fn get_server_folder_path(&self, server: &Server) -> PathBuf {
        self.base_path.join("servers").join(&server.id)
    }

    fn validate_path(&self, base: &Path, test: &Path) -> Result<(), FileError> {
        if test.starts_with(base) {
            Ok(())
        } else {
            Err(FileError::InvalidPath)
        }
    }

    pub async fn list_files(
        &self,
        server_id: &str,
        relative_path: &str,
    ) -> Result<Vec<FileItem>, FileError> {
        let server = self.get_server(server_id)?;
        let server_folder = self.get_server_folder_path(&server);

        if !server_folder.exists() {
            return Err(FileError::PathNotFound);
        }

        let absolute_path = server_folder.join(relative_path);
        self.validate_path(&server_folder, &absolute_path)?;

        if !absolute_path.exists() {
            return Err(FileError::PathNotFound);
        }

        if !absolute_path.is_dir() {
            return Err(FileError::NotADirectory);
        }

        let mut entries = fs::read_dir(&absolute_path).await?;
        let mut items = Vec::new();

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let metadata = entry.metadata().await?;

            let size = if metadata.is_dir() {
                "-".to_string()
            } else {
                let bytes = metadata.len();
                if bytes < 1024 {
                    format!("{} B", bytes)
                } else if bytes < 1024 * 1024 {
                    format!("{:.1} KB", bytes as f64 / 1024.0)
                } else {
                    format!("{:.2} MB", bytes as f64 / (1024.0 * 1024.0))
                }
            };

            let server_relative_path = path.strip_prefix(&server_folder)
                .map_err(|_| FileError::InternalError)?
                .to_string_lossy()
                .to_string();

            let id = format!(
                "{}-{}",
                server_id,
                general_purpose::STANDARD.encode(server_relative_path.as_bytes())
            );

            items.push(FileItem {
                id,
                name: entry.file_name().to_string_lossy().to_string(),
                r#type: if metadata.is_dir() { "folder" } else { "file" }.to_string(),
                path: server_relative_path,
                size,
                last_modified: metadata.modified()?.into(),
                server_id: server_id.to_string(),
            });
        }

        // Sort folders first, then by name
        items.sort_by(|a, b| {
            if a.r#type == "folder" && b.r#type != "folder" {
                std::cmp::Ordering::Less
            } else if a.r#type != "folder" && b.r#type == "folder" {
                std::cmp::Ordering::Greater
            } else {
                a.name.cmp(&b.name)
            }
        });

        Ok(items)
    }

    pub async fn get_file_content(
        &self,
        server_id: &str,
        file_path: &str,
    ) -> Result<String, FileError> {
        let server = self.get_server(server_id)?;
        let server_folder = self.get_server_folder_path(&server);
        let absolute_path = server_folder.join(file_path);

        self.validate_path(&server_folder, &absolute_path)?;

        if !absolute_path.exists() {
            return Err(FileError::PathNotFound);
        }

        if !absolute_path.is_file() {
            return Err(FileError::NotAFile);
        }

        let content = fs::read_to_string(&absolute_path).await?;
        Ok(content)
    }

    pub async fn save_file_content(
        &self,
        server_id: &str,
        file_path: &str,
        content: &str,
    ) -> Result<(), FileError> {
        let server = self.get_server(server_id)?;
        let server_folder = self.get_server_folder_path(&server);
        let absolute_path = server_folder.join(file_path);

        self.validate_path(&server_folder, &absolute_path)?;

        fs::write(&absolute_path, content).await?;
        Ok(())
    }

    pub async fn upload_file(
        &self,
        server_id: &str,
        destination_path: &str,
        file_name: &str,
        content: Vec<u8>,
    ) -> Result<(), FileError> {
        let server = self.get_server(server_id)?;
        let server_folder = self.get_server_folder_path(&server);
        let destination_dir = server_folder.join(destination_path);
        let absolute_path = destination_dir.join(file_name);

        self.validate_path(&server_folder, &absolute_path)?;

        fs::create_dir_all(&destination_dir).await?;
        fs::write(&absolute_path, content).await?;
        Ok(())
    }

    pub async fn create_folder(
        &self,
        server_id: &str,
        current_path: &str,
        new_folder_name: &str,
    ) -> Result<(), FileError> {
        let server = self.get_server(server_id)?;
        let server_folder = self.get_server_folder_path(&server);
        let absolute_path = server_folder.join(current_path).join(new_folder_name);

        self.validate_path(&server_folder, &absolute_path)?;

        fs::create_dir_all(&absolute_path).await?;
        Ok(())
    }

    pub async fn rename_item(
        &self,
        server_id: &str,
        item_path: &str,
        new_name: &str,
    ) -> Result<(), FileError> {
        let server = self.get_server(server_id)?;
        let server_folder = self.get_server_folder_path(&server);
        let absolute_current_path = server_folder.join(item_path);
        let absolute_new_path = absolute_current_path
            .parent()
            .ok_or(FileError::InvalidPath)?
            .join(new_name);

        self.validate_path(&server_folder, &absolute_current_path)?;
        self.validate_path(&server_folder, &absolute_new_path)?;

        fs::rename(&absolute_current_path, &absolute_new_path).await?;
        Ok(())
    }

    pub async fn delete_item(
        &self,
        server_id: &str,
        item_path: &str,
    ) -> Result<(), FileError> {
        let server = self.get_server(server_id)?;
        let server_folder = self.get_server_folder_path(&server);
        let absolute_path = server_folder.join(item_path);

        self.validate_path(&server_folder, &absolute_path)?;

        let metadata = fs::metadata(&absolute_path).await?;
        if metadata.is_dir() {
            fs::remove_dir_all(&absolute_path).await?;
        } else {
            fs::remove_file(&absolute_path).await?;
        }

        Ok(())
    }
}

// Handler functions for Actix-web
pub async fn handle_list_files(
    file_controller: web::Data<FileController>,
    server_id: web::Path<String>,
    query: web::Query<HashMap<String, String>>,
) -> Result<HttpResponse, FileError> {
    let relative_path = query.get("path").map(|s| s.as_str()).unwrap_or("/");
    let items = file_controller.list_files(&server_id, relative_path).await?;
    Ok(HttpResponse::Ok().json(items))
}

pub async fn handle_get_file_content(
    file_controller: web::Data<FileController>,
    server_id: web::Path<String>,
    query: web::Query<HashMap<String, String>>,
) -> Result<HttpResponse, FileError> {
    let file_path = query
        .get("path")
        .ok_or(FileError::MissingField("path".to_string()))?;

    let content = file_controller.get_file_content(&server_id, file_path).await?;
    Ok(HttpResponse::Ok().content_type("text/plain").body(content))
}

pub async fn handle_save_file_content(
    file_controller: web::Data<FileController>,
    server_id: web::Path<String>,
    payload: web::Json<HashMap<String, String>>,
) -> Result<HttpResponse, FileError> {
    let file_path = payload
        .get("filePath")
        .ok_or(FileError::MissingField("filePath".to_string()))?;

    let new_content = payload
        .get("newContent")
        .ok_or(FileError::MissingField("newContent".to_string()))?;

    file_controller
        .save_file_content(&server_id, file_path, new_content)
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "File saved successfully."
    })))
}

pub async fn handle_upload_file(
    file_controller: web::Data<FileController>,
    server_id: web::Path<String>,
    query: web::Query<HashMap<String, String>>,
    payload: web::Bytes,
) -> Result<HttpResponse, FileError> {
    let destination_path = query
        .get("destinationPath")
        .ok_or(FileError::MissingField("destinationPath".to_string()))?;

    let file_name = query
        .get("fileName")
        .ok_or(FileError::MissingField("fileName".to_string()))?;

    file_controller
        .upload_file(&server_id, destination_path, file_name, payload.to_vec())
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": format!("File uploaded successfully to {}.", destination_path)
    })))
}

pub async fn handle_create_folder(
    file_controller: web::Data<FileController>,
    server_id: web::Path<String>,
    payload: web::Json<HashMap<String, String>>,
) -> Result<HttpResponse, FileError> {
    let current_path = payload
        .get("currentPath")
        .ok_or(FileError::MissingField("currentPath".to_string()))?;

    let new_folder_name = payload
        .get("newFolderName")
        .ok_or(FileError::MissingField("newFolderName".to_string()))?;

    file_controller
        .create_folder(&server_id, current_path, new_folder_name)
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Folder created successfully."
    })))
}

pub async fn handle_rename_item(
    file_controller: web::Data<FileController>,
    server_id: web::Path<String>,
    payload: web::Json<HashMap<String, String>>,
) -> Result<HttpResponse, FileError> {
    let item_path = payload
        .get("itemPathToRename")
        .ok_or(FileError::MissingField("itemPathToRename".to_string()))?;

    let new_name = payload
        .get("newItemName")
        .ok_or(FileError::MissingField("newItemName".to_string()))?;

    file_controller
        .rename_item(&server_id, item_path, new_name)
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Item renamed successfully."
    })))
}

pub async fn handle_delete_item(
    file_controller: web::Data<FileController>,
    server_id: web::Path<String>,
    payload: web::Json<HashMap<String, String>>,
) -> Result<HttpResponse, FileError> {
    let item_path = payload
        .get("filePathToDelete")
        .ok_or(FileError::MissingField("filePathToDelete".to_string()))?;

    file_controller
        .delete_item(&server_id, item_path)
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Item deleted successfully."
    })))
}