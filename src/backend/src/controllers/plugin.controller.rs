use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use actix_web::{web, HttpResponse, Responder};
use serde::{Serialize, Deserialize};
use thiserror::Error;
use reqwest;
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;
use uuid::Uuid;
use sanitize_filename::sanitize;

#[derive(Debug, Error)]
pub enum PluginError {
    #[error("Server not found")]
    ServerNotFound,
    #[error("Plugin not found")]
    PluginNotFound,
    #[error("Invalid request: {0}")]
    BadRequest(String),
    #[error("API error: {0}")]
    ApiError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Reqwest error: {0}")]
    ReqwestError(#[from] reqwest::Error),
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Internal server error")]
    InternalError,
}

impl actix_web::error::ResponseError for PluginError {
    fn status_code(&self) -> actix_web::http::StatusCode {
        match self {
            PluginError::ServerNotFound | PluginError::PluginNotFound => {
                actix_web::http::StatusCode::NOT_FOUND
            }
            PluginError::BadRequest(_) => actix_web::http::StatusCode::BAD_REQUEST,
            PluginError::ApiError(_) => actix_web::http::StatusCode::BAD_GATEWAY,
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
    // Other server fields...
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub is_enabled: bool,
    pub file_name: String,
    pub server_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpigetSearchResult {
    pub id: u32,
    pub name: String,
    pub tag: Option<String>,
    pub downloads: u32,
    pub tested_versions: Vec<String>,
    pub author: Option<serde_json::Value>,
    pub icon: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpigetVersion {
    pub id: u32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResponse<T> {
    pub pagination: Pagination,
    pub result: Vec<T>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pagination {
    pub limit: u32,
    pub offset: u32,
    pub count: u32,
}

#[derive(Clone)]
pub struct PluginController {
    servers: Arc<Mutex<Vec<Server>>>,
    base_path: PathBuf,
}

impl PluginController {
    pub fn new(servers: Arc<Mutex<Vec<Server>>>, base_path: impl AsRef<Path>) -> Self {
        PluginController {
            servers,
            base_path: base_path.as_ref().to_path_buf(),
        }
    }

    fn get_server(&self, server_id: &str) -> Result<Server, PluginError> {
        let servers = self.servers.lock().unwrap();
        servers
            .iter()
            .find(|s| s.id == server_id)
            .cloned()
            .ok_or(PluginError::ServerNotFound)
    }

    fn get_server_folder_path(&self, server: &Server) -> PathBuf {
        self.base_path.join("servers").join(&server.id)
    }

    pub async fn search_spiget_plugins(
        &self,
        query: &str,
        page: u32,
    ) -> Result<PaginatedResponse<SpigetSearchResult>, PluginError> {
        let size = 21; // 3 rows of 7
        let offset = (page - 1) * size;
        let url = format!(
            "https://api.spiget.org/v2/search/resources/{}?sort=-downloads&size={}&page={}&fields=id,name,tag,downloads,testedVersions,author,icon",
            urlencoding::encode(query),
            size,
            page
        );

        let response = reqwest::get(&url).await?;
        let total_plugins = response
            .headers()
            .get("x-resource-count")
            .and_then(|h| h.to_str().ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        let result = response.json::<Vec<SpigetSearchResult>>().await?;

        Ok(PaginatedResponse {
            pagination: Pagination {
                limit: size,
                offset,
                count: total_plugins,
            },
            result,
        })
    }

    pub async fn get_spiget_plugin_versions(
        &self,
        resource_id: u32,
    ) -> Result<Vec<SpigetVersion>, PluginError> {
        let url = format!(
            "https://api.spiget.org/v2/resources/{}/versions?sort=-releaseDate&size=10&fields=id,name",
            resource_id
        );

        let response = reqwest::get(&url).await?;
        let versions = response.json::<Vec<SpigetVersion>>().await?;

        Ok(versions)
    }

    pub async fn list_server_plugins(&self, server_id: &str) -> Result<Vec<PluginInfo>, PluginError> {
        let server = self.get_server(server_id)?;
        let plugins_path = self.get_server_folder_path(&server).join("plugins");

        if !plugins_path.exists() {
            return Ok(Vec::new());
        }

        let mut entries = fs::read_dir(&plugins_path).await?;
        let mut plugins = Vec::new();

        while let Some(entry) = entries.next_entry().await? {
            let file_name = entry.file_name().to_string_lossy().to_string();
            
            if !(file_name.ends_with(".jar") || file_name.ends_with(".jar.disabled")) {
                continue;
            }

            let is_enabled = !file_name.ends_with(".jar.disabled");
            let clean_name = file_name
                .trim_end_matches(".jar")
                .trim_end_matches(".disabled");
            
            let (name, version) = if let Some((name_part, version_part)) = clean_name.rsplit_once('-') {
                (name_part.to_string(), version_part.to_string())
            } else {
                (clean_name.to_string(), "Unknown".to_string())
            };

            plugins.push(PluginInfo {
                id: format!("{}-{}", server_id, file_name),
                name,
                version,
                is_enabled,
                file_name,
                server_id: server_id.to_string(),
            });
        }

        Ok(plugins)
    }

    pub async fn toggle_plugin_enabled_state(
        &self,
        server_id: &str,
        plugin_file_name: &str,
        target_is_enabled: bool,
    ) -> Result<(), PluginError> {
        let server = self.get_server(server_id)?;
        let plugins_path = self.get_server_folder_path(&server).join("plugins");
        let current_path = plugins_path.join(plugin_file_name);

        if !current_path.exists() {
            return Err(PluginError::PluginNotFound);
        }

        let new_file_name = if target_is_enabled {
            plugin_file_name.replace(".jar.disabled", ".jar")
        } else {
            plugin_file_name.replace(".jar", ".jar.disabled")
        };

        let new_path = plugins_path.join(new_file_name);
        fs::rename(current_path, new_path).await?;

        Ok(())
    }

    pub async fn install_plugin_to_server(
        &self,
        server_id: &str,
        spiget_resource_id: u32,
        plugin_name: &str,
    ) -> Result<(), PluginError> {
        let server = self.get_server(server_id)?;
        let plugins_path = self.get_server_folder_path(&server).join("plugins");
        fs::create_dir_all(&plugins_path).await?;

        let download_url = format!(
            "https://api.spiget.org/v2/resources/{}/download",
            spiget_resource_id
        );
        let safe_plugin_name = sanitize(plugin_name);
        let final_filename = format!("{}.jar", safe_plugin_name);

        let response = reqwest::get(&download_url).await?;
        let bytes = response.bytes().await?;

        let mut file = File::create(plugins_path.join(&final_filename)).await?;
        file.write_all(&bytes).await?;

        Ok(())
    }

    pub async fn uninstall_plugin(
        &self,
        server_id: &str,
        plugin_file_name: &str,
    ) -> Result<(), PluginError> {
        let server = self.get_server(server_id)?;
        let plugin_path = self.get_server_folder_path(&server)
            .join("plugins")
            .join(plugin_file_name);

        if !plugin_path.exists() {
            return Err(PluginError::PluginNotFound);
        }

        fs::remove_file(plugin_path).await?;
        Ok(())
    }

    pub async fn search_modrinth(
        &self,
        query: &str,
    ) -> Result<serde_json::Value, PluginError> {
        let facets = serde_json::json!([["project_type:modpack"]]);
        let url = format!(
            "https://api.modrinth.com/v2/search?query={}&facets={}",
            urlencoding::encode(query),
            urlencoding::encode(&facets.to_string())
        );

        let response = reqwest::get(&url).await?;
        let data = response.json::<serde_json::Value>().await?;

        Ok(data)
    }

    pub async fn get_modrinth_project_versions(
        &self,
        project_id: &str,
    ) -> Result<serde_json::Value, PluginError> {
        let loaders = serde_json::json!(["fabric", "forge", "quilt", "neoforge"]);
        let url = format!(
            "https://api.modrinth.com/v2/project/{}/version?loaders={}",
            project_id,
            urlencoding::encode(&loaders.to_string())
        );

        let response = reqwest::get(&url).await?;
        let data = response.json::<serde_json::Value>().await?;

        Ok(data)
    }

    pub async fn get_paper_mc_versions(
        &self,
        project: &str,
    ) -> Result<serde_json::Value, PluginError> {
        if !["paper", "velocity"].contains(&project) {
            return Err(PluginError::BadRequest("Invalid project specified".to_string()));
        }

        let url = format!("https://api.papermc.io/v2/projects/{}", project);
        let response = reqwest::get(&url).await?;
        let data = response.json::<serde_json::Value>().await?;

        Ok(data)
    }

    pub async fn get_paper_mc_builds(
        &self,
        project: &str,
        version: &str,
    ) -> Result<serde_json::Value, PluginError> {
        if !["paper", "velocity"].contains(&project) {
            return Err(PluginError::BadRequest("Invalid project specified".to_string()));
        }

        let url = format!(
            "https://api.papermc.io/v2/projects/{}/versions/{}/builds",
            project, version
        );
        let response = reqwest::get(&url).await?;
        let data = response.json::<serde_json::Value>().await?;

        Ok(data)
    }
}

// Handler functions for Actix-web
pub async fn handle_search_spiget_plugins(
    controller: web::Data<PluginController>,
    query: web::Query<HashMap<String, String>>,
) -> Result<HttpResponse, PluginError> {
    let search_query = query.get("q").map(|s| s.as_str()).unwrap_or("");
    let page = query
        .get("page")
        .and_then(|p| p.parse().ok())
        .unwrap_or(1);

    let response = controller.search_spiget_plugins(search_query, page).await?;
    Ok(HttpResponse::Ok().json(response))
}

pub async fn handle_get_spiget_plugin_versions(
    controller: web::Data<PluginController>,
    query: web::Query<HashMap<String, String>>,
) -> Result<HttpResponse, PluginError> {
    let resource_id = query
        .get("resourceId")
        .ok_or(PluginError::BadRequest("Resource ID is required".to_string()))?
        .parse()
        .map_err(|_| PluginError::BadRequest("Invalid resource ID".to_string()))?;

    let versions = controller.get_spiget_plugin_versions(resource_id).await?;
    Ok(HttpResponse::Ok().json(versions))
}

pub async fn handle_list_server_plugins(
    controller: web::Data<PluginController>,
    server_id: web::Path<String>,
) -> Result<HttpResponse, PluginError> {
    let plugins = controller.list_server_plugins(&server_id).await?;
    Ok(HttpResponse::Ok().json(plugins))
}

pub async fn handle_toggle_plugin(
    controller: web::Data<PluginController>,
    server_id: web::Path<String>,
    payload: web::Json<HashMap<String, serde_json::Value>>,
) -> Result<HttpResponse, PluginError> {
    let plugin_file_name = payload
        .get("pluginFileName")
        .and_then(|v| v.as_str())
        .ok_or(PluginError::BadRequest("pluginFileName is required".to_string()))?;

    let target_is_enabled = payload
        .get("targetIsEnabled")
        .and_then(|v| v.as_bool())
        .ok_or(PluginError::BadRequest("targetIsEnabled is required".to_string()))?;

    controller
        .toggle_plugin_enabled_state(&server_id, plugin_file_name, target_is_enabled)
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": format!("Plugin has been {}", if target_is_enabled { "enabled" } else { "disabled" })
    })))
}

pub async fn handle_install_plugin(
    controller: web::Data<PluginController>,
    server_id: web::Path<String>,
    payload: web::Json<HashMap<String, serde_json::Value>>,
) -> Result<HttpResponse, PluginError> {
    let spiget_resource_id = payload
        .get("spigetResourceId")
        .and_then(|v| v.as_u64())
        .ok_or(PluginError::BadRequest("spigetResourceId is required".to_string()))?;

    let plugin_name = payload
        .get("pluginNameForToast")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| format!("plugin_{}", spiget_resource_id));

    controller
        .install_plugin_to_server(&server_id, spiget_resource_id as u32, plugin_name)
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": format!("Plugin \"{}\" installed successfully", plugin_name)
    })))
}

pub async fn handle_uninstall_plugin(
    controller: web::Data<PluginController>,
    server_id: web::Path<String>,
    payload: web::Json<HashMap<String, serde_json::Value>>,
) -> Result<HttpResponse, PluginError> {
    let plugin_file_name = payload
        .get("pluginFileName")
        .and_then(|v| v.as_str())
        .ok_or(PluginError::BadRequest("pluginFileName is required".to_string()))?;

    controller.uninstall_plugin(&server_id, plugin_file_name).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Plugin uninstalled successfully"
    })))
}

pub async fn handle_search_modrinth(
    controller: web::Data<PluginController>,
    query: web::Query<HashMap<String, String>>,
) -> Result<HttpResponse, PluginError> {
    let search_query = query.get("q").map(|s| s.as_str()).unwrap_or("");
    let result = controller.search_modrinth(search_query).await?;
    Ok(HttpResponse::Ok().json(result))
}

pub async fn handle_get_modrinth_versions(
    controller: web::Data<PluginController>,
    project_id: web::Path<String>,
) -> Result<HttpResponse, PluginError> {
    let versions = controller.get_modrinth_project_versions(&project_id).await?;
    Ok(HttpResponse::Ok().json(versions))
}

pub async fn handle_get_paper_mc_versions(
    controller: web::Data<PluginController>,
    project: web::Path<String>,
) -> Result<HttpResponse, PluginError> {
    let versions = controller.get_paper_mc_versions(&project).await?;
    Ok(HttpResponse::Ok().json(versions))
}

pub async fn handle_get_paper_mc_builds(
    controller: web::Data<PluginController>,
    params: web::Path<(String, String)>,
) -> Result<HttpResponse, PluginError> {
    let (project, version) = params.into_inner();
    let builds = controller.get_paper_mc_builds(&project, &version).await?;
    Ok(HttpResponse::Ok().json(builds))
}