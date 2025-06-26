package com.velocitymanager.plugin.model;

/**
 * Represents a GameServer object from the Velocity Manager API.
 * This is a Java Record, which is a concise way to create immutable data classes.
 */
public record GameServer(
    String id,
    String name,
    String status,
    int port,
    String ip,
    String softwareType,
    String serverVersion
) {
    // The ItemDataKey has been removed as GUI interactions are not possible in Velocity.
}
