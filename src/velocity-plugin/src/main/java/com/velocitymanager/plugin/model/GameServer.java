package com.velocitymanager.plugin.model;

import com.velocitypowered.api.item.ItemDataKey;

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
    /**
     * A key to store the server ID in an ItemStack's metadata.
     * This allows us to retrieve which server was clicked in the GUI.
     */
    public static final ItemDataKey<String> SERVER_ID_KEY = ItemDataKey.of(String.class, "velocitymanager.serverid");
}
