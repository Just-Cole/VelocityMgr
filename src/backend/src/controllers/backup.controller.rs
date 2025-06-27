use actix_web::{web, App, HttpServer};
use std::sync::{Arc, Mutex};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let servers = Arc::new(Mutex::new(vec![
        Server {
            id: "server1".to_string(),
            name: "Test Server".to_string(),
            status: "Offline".to_string(),
        }
    ]));
    
    let backup_controller = BackupController::new(servers, "./data");

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(backup_controller.clone()))
            .service(
                web::resource("/servers/{server_id}/backups")
                    .route(web::post().to(handle_create_backup))
                    .route(web::get().to(handle_list_backups)),
            )
            .service(
                web::resource("/servers/{server_id}/backups/{file_name}/restore")
                    .route(web::post().to(handle_restore_backup)),
            )
            .service(
                web::resource("/servers/{server_id}/backups/{file_name}/download")
                    .route(web::get().to(handle_download_backup)),
            )
            .service(
                web::resource("/servers/{server_id}/backups/{file_name}")
                    .route(web::delete().to(handle_delete_backup)),
            )
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}