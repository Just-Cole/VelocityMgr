use actix_multipart::Multipart;
use actix_web::{web, HttpResponse, Responder};
use std::path::PathBuf;
use tempfile::tempdir;
use uuid::Uuid;
use std::sync::Arc;
use serde::{Deserialize, Serialize};

// Define shared state that will hold our controllers
#[derive(Clone)]
pub struct AppState {
    pub index_controller: Arc<IndexController>,
    pub auth_controller: Arc<AuthController>,
    pub role_controller: Arc<RoleController>,
    pub server_controller: Arc<ServerController>,
    pub backup_controller: Arc<BackupController>,
    pub plugin_controller: Arc<PluginController>,
    pub console_controller: Arc<ConsoleController>,
    pub file_controller: Arc<FileController>,
}

// Configuration struct (would be populated from config.json)
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    // Add your config fields here
}

// Main router configuration function
pub fn configure_routes(cfg: &mut web::ServiceConfig, config: Config) {
    // Create controllers with shared state
    let index_controller = Arc::new(IndexController::new(config));
    let auth_controller = Arc::new(AuthController::new(index_controller.clone()));
    let role_controller = Arc::new(RoleController::new(index_controller.clone()));
    let server_controller = Arc::new(ServerController::new(index_controller.clone()));
    let backup_controller = Arc::new(BackupController::new(index_controller.clone()));
    let plugin_controller = Arc::new(PluginController::new(index_controller.clone()));
    let console_controller = Arc::new(ConsoleController::new(index_controller.clone()));
    let file_controller = Arc::new(FileController::new(index_controller.clone()));

    let app_state = web::Data::new(AppState {
        index_controller,
        auth_controller,
        role_controller,
        server_controller,
        backup_controller,
        plugin_controller,
        console_controller,
        file_controller,
    });

    // Configure file upload settings
    let upload_temp_dir = tempdir().expect("Could not create temp directory");
    let upload_config = web::PayloadConfig::new(500 * 1024 * 1024); // 500MB limit

    cfg.app_data(app_state.clone())
        .app_data(upload_config)
        .service(
            web::scope("/api")
                // --- Authentication, Roles, and Permissions ---
                .service(
                    web::resource("/auth/login")
                        .route(web::post().to(handle_login)),
                
                // User Management
                .service(
                    web::resource("/auth/users")
                        .route(web::get().to(handle_list_users))
                        .route(web::post().to(handle_add_user)),
                )
                .service(
                    web::resource("/auth/users/{username}")
                        .route(web::delete().to(handle_delete_user)),
                )
                .service(
                    web::resource("/auth/users/{username}/roles")
                        .route(web::put().to(handle_update_user_roles)),
                )
                .service(
                    web::resource("/auth/users/{username}/password")
                        .route(web::put().to(handle_update_password)),
                )
                
                // Role & Permission Management (RBAC)
                .service(
                    web::resource("/auth/permissions")
                        .route(web::get().to(handle_list_permissions)),
                )
                .service(
                    web::resource("/auth/roles")
                        .route(web::get().to(handle_list_roles))
                        .route(web::post().to(handle_create_role)),
                )
                .service(
                    web::resource("/auth/roles/{role_name}")
                        .route(web::put().to(handle_update_role))
                        .route(web::delete().to(handle_delete_role)),
                )

                // --- Server Management ---
                .service(
                    web::resource("/minecraft/servers")
                        .route(web::get().to(handle_list_servers))
                        .route(web::post().to(handle_create_server)),
                )
                .service(
                    web::resource("/minecraft/servers/create-from-modpack")
                        .route(web::post().to(handle_create_from_modpack)),
                )
                .service(
                    web::resource("/minecraft/servers/upload-zip")
                        .route(web::post().to(handle_upload_zip)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/settings")
                        .route(web::patch().to(handle_update_server_settings)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/delete-recoverable")
                        .route(web::post().to(handle_delete_with_recovery)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/banned-players")
                        .route(web::get().to(handle_get_banned_players)),
                )

                // Server Actions
                .service(
                    web::resource("/minecraft/start")
                        .route(web::post().to(handle_start_server)),
                )
                .service(
                    web::resource("/minecraft/stop")
                        .route(web::post().to(handle_stop_server)),
                )
                .service(
                    web::resource("/minecraft/restart")
                        .route(web::post().to(handle_restart_server)),
                )
                .service(
                    web::resource("/minecraft/status")
                        .route(web::get().to(handle_server_status)),
                )
                
                // Console
                .service(
                    web::resource("/minecraft/servers/{server_id}/console/stream")
                        .route(web::get().to(handle_live_console)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/console/full-log")
                        .route(web::get().to(handle_full_log)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/command")
                        .route(web::post().to(handle_send_command)),
                )
                
                // Recovery
                .service(
                    web::resource("/minecraft/servers/recovery")
                        .route(web::get().to(handle_list_recoverable_servers)),
                )
                .service(
                    web::resource("/minecraft/servers/recovery/restore")
                        .route(web::post().to(handle_restore_server)),
                )
                .service(
                    web::resource("/minecraft/servers/recovery/delete")
                        .route(web::post().to(handle_permanent_delete)),
                )

                // Server Properties
                .service(
                    web::resource("/minecraft/servers/{server_id}/server-properties")
                        .route(web::get().to(handle_get_server_properties))
                        .route(web::put().to(handle_update_server_properties)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/velocity-toml")
                        .route(web::get().to(handle_get_velocity_toml))
                        .route(web::put().to(handle_update_velocity_toml)),
                )

                // File Management
                .service(
                    web::resource("/minecraft/servers/{server_id}/files")
                        .route(web::get().to(handle_list_files)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/files/content")
                        .route(web::get().to(handle_get_file_content))
                        .route(web::post().to(handle_save_file_content)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/files/upload")
                        .route(web::post().to(handle_upload_file)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/files/create-folder")
                        .route(web::post().to(handle_create_folder)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/files/actions/rename")
                        .route(web::post().to(handle_rename_item)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/files/actions/delete")
                        .route(web::post().to(handle_delete_item)),
                )

                // Papermc API proxy routes
                .service(
                    web::resource("/papermc/versions/{project}")
                        .route(web::get().to(handle_get_paper_versions)),
                )
                .service(
                    web::resource("/papermc/builds/{project}/{version}")
                        .route(web::get().to(handle_get_paper_builds)),
                )

                // Modrinth Routes
                .service(
                    web::resource("/modrinth/search")
                        .route(web::get().to(handle_search_modrinth)),
                )
                .service(
                    web::resource("/modrinth/project/{project_id}/versions")
                        .route(web::get().to(handle_get_modrinth_versions)),
                )

                // Plugin Routes
                .service(
                    web::resource("/plugins/search")
                        .route(web::get().to(handle_search_plugins)),
                )
                .service(
                    web::resource("/plugins/details")
                        .route(web::get().to(handle_get_plugin_versions)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/plugins")
                        .route(web::get().to(handle_list_server_plugins)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/plugins/install")
                        .route(web::post().to(handle_install_plugin)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/plugins/toggle")
                        .route(web::post().to(handle_toggle_plugin)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/plugins/uninstall")
                        .route(web::post().to(handle_uninstall_plugin)),
                )

                // Backup Routes
                .service(
                    web::resource("/minecraft/servers/{server_id}/backups")
                        .route(web::get().to(handle_list_backups))
                        .route(web::post().to(handle_create_backup)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/backups/{file_name}/restore")
                        .route(web::post().to(handle_restore_backup)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/backups/{file_name}/download")
                        .route(web::get().to(handle_download_backup)),
                )
                .service(
                    web::resource("/minecraft/servers/{server_id}/backups/{file_name}")
                        .route(web::delete().to(handle_delete_backup)),
                )
        );
}

// Example handler implementation (you would implement all handlers similarly)
async fn handle_login(
    data: web::Data<AppState>,
    payload: web::Json<LoginRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    let result = data.auth_controller.login(&payload).await?;
    Ok(HttpResponse::Ok().json(result))
}

// File upload handler example
async fn handle_upload_zip(
    data: web::Data<AppState>,
    mut payload: Multipart,
) -> Result<HttpResponse, actix_web::Error> {
    // Process multipart upload
    let mut file_path = None;
    
    while let Ok(Some(mut field)) = payload.try_next().await {
        let content_type = field.content_disposition().unwrap();
        let filename = content_type.get_filename().unwrap();
        let temp_file = format!("velocity-manager-upload-{}-{}", Uuid::new_v4(), filename);
        let filepath = PathBuf::from("/tmp").join(temp_file);
        
        // Save file to temp location
        let mut f = web::block(|| std::fs::File::create(&filepath))
            .await?
            .unwrap();
            
        while let Some(chunk) = field.next().await {
            let data = chunk?;
            f = web::block(move || f.write_all(&data).map(|_| f))
                .await?
                .unwrap();
        }
        
        file_path = Some(filepath);
    }
    
    if let Some(path) = file_path {
        let result = data.server_controller.create_from_zip(path).await?;
        Ok(HttpResponse::Ok().json(result))
    } else {
        Err(actix_web::error::ErrorBadRequest("No file uploaded"))
    }
}

// Define request/response types
#[derive(Debug, Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

// Note: You would need to implement all the controller structs and their methods
// This is just the routing structure