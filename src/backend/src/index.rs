use std::path::Path;
use std::fs;
use std::collections::HashMap;
use std::env;
use std::net::IpAddr;
use std::time::Duration;

use actix_web::{web, App, HttpServer, middleware, HttpResponse, Responder};
use actix_web::http::StatusCode;
use dotenv::dotenv;
use serde_json::{Value, json};
use serde::Deserialize;
use listenfd::ListenFd;

#[derive(Debug, Deserialize)]
struct Config {
    backend_port: Option<u16>,
    // Add other config fields as needed
}

// Load configuration from file
fn load_config() -> Config {
    let config_path = Path::new("../../../config.json");
    if config_path.exists() {
        match fs::read_to_string(config_path) {
            Ok(contents) => {
                match serde_json::from_str(&contents) {
                    Ok(config) => config,
                    Err(e) => {
                        eprintln!("Error parsing config.json: {}", e);
                        Config { backend_port: None }
                    }
                }
            }
            Err(e) => {
                eprintln!("Error reading config.json: {}", e);
                Config { backend_port: None }
            }
        }
    } else {
        Config { backend_port: None }
    }
}

// Global error handler
async fn error_handler(err: actix_web::Error) -> impl Responder {
    let status = err.as_response_error().status_code();
    let error_msg = err.to_string();
    
    eprintln!("API Error Handler Caught: {}", error_msg);
    
    let mut response = json!({
        "message": error_msg,
    });
    
    // Include stack trace in development
    if env::var("NODE_ENV").unwrap_or_default() != "production" {
        response["stack"] = json!(err.to_string());
    }
    
    HttpResponse::build(status)
        .json(response)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Load environment variables
    dotenv().ok();
    
    // Load configuration
    let config = load_config();
    
    // Determine port to use (env var -> config -> default)
    let port = env::var("BACKEND_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .or(config.backend_port)
        .unwrap_or(3005);
    
    let hostname = "0.0.0.0";
    
    println!("Starting backend API server...");
    
    // Create server with graceful shutdown
    let mut server = HttpServer::new(move || {
        App::new()
            // Middleware
            .wrap(middleware::Logger::default())
            .wrap(middleware::NormalizePath::trim())
            .wrap(middleware::Cors::default()
                .allow_any_origin()
                .allow_any_method()
                .allow_any_header()
                .max_age(3600))
            // JSON body parser
            .app_data(web::JsonConfig::default().limit(4096))
            // URL encoded parser
            .app_data(web::FormConfig::default().limit(4096))
            // API routes (would be defined in your routes module)
            .service(
                web::scope("/api")
                    // Add your API routes here
                    .route("/test", web::get().to(|| HttpResponse::Ok().body("test")))
            )
            // Error handler
            .app_data(web::JsonConfig::default().error_handler(|err, _req| {
                error_handler(err).into()
            }))
    });
    
    // For hot reloading during development
    let mut listenfd = ListenFd::from_env();
    server = if let Some(l) = listenfd.take_tcp_listener(0)? {
        server.listen(l)?
    } else {
        server.bind((hostname, port))?
    };
    
    println!("Backend API server listening on http://{}:{}", 
        if hostname == "0.0.0.0" { "localhost" } else { hostname }, 
        port);
    
    // Run server with graceful shutdown
    let srv = server.run();
    
    // Handle shutdown signals
    let srv_handle = srv.handle();
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.unwrap();
        println!("[SIGINT] Received. Shutting down gracefully...");
        srv_handle.stop(true).await;
    });
    
    srv.await?;
    
    println!("Backend server closed. Exiting process.");
    Ok(())
}