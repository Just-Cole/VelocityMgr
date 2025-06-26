
package com.velocitymanager.spigot.process;

import com.google.gson.Gson;
import com.velocitymanager.spigot.SpigotVManager;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.entity.Player;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class CreationProcess {

    private enum Step {
        NAME, PORT, TYPE, VERSION, CONFIRMATION, DONE
    }

    private final Player player;
    private final SpigotVManager plugin;
    private final Gson gson = new Gson();
    private Step currentStep = Step.NAME;

    // Collected data
    private String name;
    private int port;
    private String type;
    private String version;
    private String build;

    public CreationProcess(Player player, SpigotVManager plugin) {
        this.player = player;
        this.plugin = plugin;
        prompt();
    }

    private void sendPrompt(Component message) {
        player.sendMessage(message);
    }

    private void prompt() {
        switch (currentStep) {
            case NAME:
                sendPrompt(Component.text("Enter a name for the new server:", NamedTextColor.GOLD));
                break;
            case PORT:
                sendPrompt(Component.text("Enter a port number (1025-65535):", NamedTextColor.GOLD));
                break;
            case TYPE:
                sendPrompt(Component.text("Enter server type (PaperMC or Velocity):", NamedTextColor.GOLD));
                break;
            case VERSION:
                sendPrompt(Component.text("Enter the server version (e.g., 1.20.4):", NamedTextColor.GOLD));
                break;
            case CONFIRMATION:
                sendPrompt(Component.text("--- Server Configuration ---", NamedTextColor.AQUA));
                sendPrompt(Component.text("Name: ", NamedTextColor.GRAY).append(Component.text(name, NamedTextColor.WHITE)));
                sendPrompt(Component.text("Port: ", NamedTextColor.GRAY).append(Component.text(String.valueOf(port), NamedTextColor.WHITE)));
                sendPrompt(Component.text("Type: ", NamedTextColor.GRAY).append(Component.text(type, NamedTextColor.WHITE)));
                sendPrompt(Component.text("Version: ", NamedTextColor.GRAY).append(Component.text(version, NamedTextColor.WHITE)));
                sendPrompt(Component.text("Build: ", NamedTextColor.GRAY).append(Component.text("latest", NamedTextColor.WHITE)));
                sendPrompt(Component.text("Type 'yes' to create or 'no' to cancel.", NamedTextColor.GOLD));
                break;
        }
    }

    public void handleInput(String input) {
        if ("cancel".equalsIgnoreCase(input)) {
            sendPrompt(Component.text("Server creation cancelled.", NamedTextColor.RED));
            plugin.getCreationProcesses().remove(player.getUniqueId());
            return;
        }

        switch (currentStep) {
            case NAME:
                if (input.length() < 3) {
                    sendPrompt(Component.text("Name must be at least 3 characters.", NamedTextColor.RED));
                } else {
                    this.name = input;
                    currentStep = Step.PORT;
                }
                break;
            case PORT:
                try {
                    int p = Integer.parseInt(input);
                    if (p < 1025 || p > 65535) throw new NumberFormatException();
                    this.port = p;
                    currentStep = Step.TYPE;
                } catch (NumberFormatException e) {
                    sendPrompt(Component.text("Invalid port. Must be a number between 1025-65535.", NamedTextColor.RED));
                }
                break;
            case TYPE:
                if ("papermc".equalsIgnoreCase(input) || "velocity".equalsIgnoreCase(input)) {
                    this.type = "papermc".equalsIgnoreCase(input) ? "PaperMC" : "Velocity";
                    currentStep = Step.VERSION;
                } else {
                    sendPrompt(Component.text("Invalid type. Please enter 'PaperMC' or 'Velocity'.", NamedTextColor.RED));
                }
                break;
            case VERSION:
                this.version = input.trim();
                currentStep = Step.CONFIRMATION;
                break;
            case CONFIRMATION:
                if ("yes".equalsIgnoreCase(input)) {
                    sendFinalRequest();
                    currentStep = Step.DONE;
                } else if ("no".equalsIgnoreCase(input)) {
                     sendPrompt(Component.text("Server creation cancelled.", NamedTextColor.RED));
                     currentStep = Step.DONE;
                } else {
                    sendPrompt(Component.text("Please type 'yes' or 'no'.", NamedTextColor.RED));
                }
                break;
        }

        if (currentStep != Step.DONE) {
            prompt();
        } else {
            plugin.getCreationProcesses().remove(player.getUniqueId());
        }
    }

    private void sendFinalRequest() {
        Map<String, String> payload = new HashMap<>();
        payload.put("serverName", this.name);
        payload.put("port", String.valueOf(this.port));
        payload.put("serverType", this.type);
        payload.put("serverVersion", this.version);
        // No build number is sent; the backend will fetch the latest.

        String jsonPayload = gson.toJson(payload);
        String message = "CREATE_SERVER:" + jsonPayload;
        player.sendPluginMessage(plugin, SpigotVManager.CHANNEL, message.getBytes(StandardCharsets.UTF_8));
        sendPrompt(Component.text("Creation request sent to proxy...", NamedTextColor.GRAY));
    }
}
