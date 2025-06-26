package com.velocitymanager.spigot.model;

public record GameServer(
    String id,
    String name,
    String status,
    int port,
    String ip,
    String softwareType,
    String serverVersion
) {
    // This is a simple data record to hold server info received from the proxy.
}
