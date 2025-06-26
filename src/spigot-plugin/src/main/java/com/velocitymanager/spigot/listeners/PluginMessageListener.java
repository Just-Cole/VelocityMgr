
package com.velocitymanager.spigot.listeners;

import com.velocitymanager.spigot.SpigotVManager;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.velocitymanager.spigot.model.GameServer;
import com.velocitymanager.spigot.process.CreationProcess;
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
        String data = parts.length > 1 ? parts[1] : "";

        CreationProcess creationProcess = plugin.getCreationProcesses().get(player.getUniqueId());

        switch (command) {
            case "SERVERS":
                handleServerList(player, data);
                break;
            case "PAPERTMC_VERSIONS":
            case "VELOCITY_VERSIONS":
            case "PAPERTMC_BUILDS":
            case "VELOCITY_BUILDS":
                if (creationProcess != null) {
                    creationProcess.handleApiResponse(command, data);
                }
                break;
            case "ACTION_RESPONSE":
            case "CREATION_RESPONSE":
                handleResponse(player, data);
                break;
        }
    }

    private void handleServerList(Player player, String json) {
        Type listType = new TypeToken<List<GameServer>>() {}.getType();
        List<GameServer> servers = gson.fromJson(json, listType);
        plugin.getServer().getScheduler().runTask(plugin, () -> {
            plugin.getServerListUI().open(player, servers, 0); // Open at page 0
        });
    }

    private void handleResponse(Player player, String responseData) {
        String[] responseParts = responseData.split(":", 2);
        String status = responseParts[0];
        String responseMessage = responseParts.length > 1 ? responseParts[1] : "No details provided.";

        if ("success".equals(status)) {
            player.sendMessage(Component.text(responseMessage, NamedTextColor.GREEN));
        } else {
            player.sendMessage(Component.text(responseMessage, NamedTextColor.RED));
        }
    }
}
