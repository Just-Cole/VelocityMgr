
package com.velocitymanager.spigot.listeners;

import com.velocitymanager.spigot.SpigotVManager;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.velocitymanager.spigot.model.GameServer;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.List;

public class PluginMessageListener implements org.bukkit.plugin.messaging.PluginMessageListener {
    private final SpigotVManager plugin;
    private final Gson gson = new Gson();

    public PluginMessageListener(SpigotVManager plugin) {
        this.plugin = plugin;
    }

    @Override
    public void onPluginMessageReceived(@NotNull String channel, @NotNull Player player, byte[] messageBytes) {
        if (!channel.equals(SpigotVManager.CHANNEL)) {
            return;
        }
        
        String message = new String(messageBytes, StandardCharsets.UTF_8);
        String[] parts = message.split(":", 2);
        String command = parts[0];

        if ("SERVERS".equals(command) && parts.length > 1) {
            String json = parts[1];
            Type listType = new TypeToken<List<GameServer>>() {}.getType();
            List<GameServer> servers = gson.fromJson(json, listType);
            plugin.getServer().getScheduler().runTask(plugin, () -> {
                plugin.getServerListUI().open(player, servers, 0); // Open at page 0
            });
        } else if ("ACTION_RESPONSE".equals(command) && parts.length > 1) {
            String[] responseParts = parts[1].split(":", 2);
            String status = responseParts[0];
            String responseMessage = responseParts.length > 1 ? responseParts[1] : "No details provided.";
            
            if ("success".equals(status)) {
                player.sendMessage(Component.text(responseMessage, NamedTextColor.GREEN));
            } else {
                player.sendMessage(Component.text(responseMessage, NamedTextColor.RED));
            }
        }
    }
}
