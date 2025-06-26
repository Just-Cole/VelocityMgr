
package com.velocitymanager.spigot.process;

import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import com.google.gson.reflect.TypeToken;
import com.velocitymanager.spigot.SpigotVManager;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.TextComponent;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.entity.Player;

import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class CreationProcess {

    private enum Step {
        NAME, PORT, TYPE, VERSION, BUILD, CONFIRMATION, DONE
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

    // Temporary data for selection
    private List<String> availableVersions = Collections.emptyList();
    private List<Integer> availableBuilds = Collections.emptyList();

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
                sendPrompt(Component.text("Fetching available versions...", NamedTextColor.GRAY));
                String requestType = "GET_" + this.type.toUpperCase() + "_VERSIONS";
                player.sendPluginMessage(plugin, SpigotVManager.CHANNEL, requestType.getBytes(StandardCharsets.UTF_8));
                break;
            case BUILD:
                sendPrompt(Component.text("Fetching available builds for " + version + "...", NamedTextColor.GRAY));
                String buildRequestType = "GET_" + this.type.toUpperCase() + "_BUILDS:" + this.version;
                player.sendPluginMessage(plugin, SpigotVManager.CHANNEL, buildRequestType.getBytes(StandardCharsets.UTF_8));
                break;
            case CONFIRMATION:
                sendPrompt(Component.text("--- Server Configuration ---", NamedTextColor.AQUA));
                sendPrompt(Component.text("Name: ", NamedTextColor.GRAY).append(Component.text(name, NamedTextColor.WHITE)));
                sendPrompt(Component.text("Port: ", NamedTextColor.GRAY).append(Component.text(String.valueOf(port), NamedTextColor.WHITE)));
                sendPrompt(Component.text("Type: ", NamedTextColor.GRAY).append(Component.text(type, NamedTextColor.WHITE)));
                sendPrompt(Component.text("Version: ", NamedTextColor.GRAY).append(Component.text(version, NamedTextColor.WHITE)));
                sendPrompt(Component.text("Build: ", NamedTextColor.GRAY).append(Component.text(build, NamedTextColor.WHITE)));
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
                 if (availableVersions.contains(input)) {
                    this.version = input;
                    currentStep = Step.BUILD;
                } else {
                    sendPrompt(Component.text("Invalid version. Please select one from the list.", NamedTextColor.RED));
                }
                break;
            case BUILD:
                try {
                    int b = Integer.parseInt(input);
                    if (availableBuilds.contains(b)) {
                        this.build = input;
                        currentStep = Step.CONFIRMATION;
                    } else {
                        throw new NumberFormatException();
                    }
                } catch (NumberFormatException e) {
                    sendPrompt(Component.text("Invalid build number. Please select one from the list.", NamedTextColor.RED));
                }
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

    public void handleApiResponse(String command, String data) {
        try {
            switch(command) {
                case "PAPERTMC_VERSIONS":
                case "VELOCITY_VERSIONS": {
                    Type listType = new TypeToken<List<String>>() {}.getType();
                    this.availableVersions = gson.fromJson(data, listType);
                    Collections.reverse(this.availableVersions); // Show newest first
                    sendPrompt(Component.text("Please choose a version from the list:", NamedTextColor.GOLD));
                    
                    TextComponent.Builder versionsBuilder = Component.text();
                    for(String v : this.availableVersions) {
                        versionsBuilder.append(
                                Component.text(" [" + v + "] ", NamedTextColor.AQUA)
                                        .clickEvent(ClickEvent.suggestCommand(v))
                        );
                    }
                    player.sendMessage(versionsBuilder.build());
                    break;
                }
                 case "PAPERTMC_BUILDS":
                 case "VELOCITY_BUILDS": {
                    Type listType = new TypeToken<List<Integer>>() {}.getType();
                    this.availableBuilds = gson.fromJson(data, listType);
                    Collections.reverse(this.availableBuilds); // Show newest first
                    String latestBuild = String.valueOf(this.availableBuilds.get(0));
                    sendPrompt(Component.text("Please choose a build (latest is " + latestBuild + "):", NamedTextColor.GOLD));
                    Component buildsComponent = Component.text("Latest: ")
                            .append(Component.text("[" + latestBuild + "]", NamedTextColor.AQUA)
                                    .clickEvent(ClickEvent.suggestCommand(latestBuild)));
                    player.sendMessage(buildsComponent);
                    break;
                 }
            }
        } catch (JsonSyntaxException e) {
            sendPrompt(Component.text("Failed to process server data. Please try again.", NamedTextColor.RED));
            plugin.getCreationProcesses().remove(player.getUniqueId());
        }
    }

    private void sendFinalRequest() {
        Map<String, String> payload = new HashMap<>();
        payload.put("serverName", this.name);
        payload.put("port", String.valueOf(this.port));
        payload.put("serverType", this.type);
        payload.put("serverVersion", this.version);
        if ("PaperMC".equals(this.type)) {
            payload.put("paperBuild", this.build);
        } else {
            payload.put("velocityBuild", this.build);
        }

        String jsonPayload = gson.toJson(payload);
        String message = "CREATE_SERVER:" + jsonPayload;
        player.sendPluginMessage(plugin, SpigotVManager.CHANNEL, message.getBytes(StandardCharsets.UTF_8));
        sendPrompt(Component.text("Creation request sent to proxy...", NamedTextColor.GRAY));
    }
}
