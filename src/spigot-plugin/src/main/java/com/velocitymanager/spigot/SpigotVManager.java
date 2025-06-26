
package com.velocitymanager.spigot;

import com.velocitymanager.spigot.commands.ManageGuiCommand;
import com.velocitymanager.spigot.listeners.CreationListener;
import com.velocitymanager.spigot.listeners.GuiListener;
import com.velocitymanager.spigot.listeners.PluginMessageListener;
import com.velocitymanager.spigot.process.CreationProcess;
import com.velocitymanager.spigot.ui.ServerListUI;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class SpigotVManager extends JavaPlugin {

    public static final String CHANNEL = "vmanager:main";
    private ServerListUI serverListUI;
    private final Map<UUID, CreationProcess> creationProcesses = new ConcurrentHashMap<>();

    @Override
    public void onEnable() {
        this.serverListUI = new ServerListUI(this);
        
        // Register Command
        this.getCommand("vmanagegui").setExecutor(new ManageGuiCommand(this));

        // Register Event Listeners
        this.getServer().getPluginManager().registerEvents(new GuiListener(this), this);
        this.getServer().getPluginManager().registerEvents(new CreationListener(this), this);

        // Register Plugin Messaging Channels
        this.getServer().getMessenger().registerOutgoingPluginChannel(this, CHANNEL);
        this.getServer().getMessenger().registerIncomingPluginChannel(this, CHANNEL, new PluginMessageListener(this));
        
        getLogger().info("SpigotVManager GUI Companion has been enabled.");
    }

    @Override
    public void onDisable() {
        this.getServer().getMessenger().unregisterOutgoingPluginChannel(this);
        this.getServer().getMessenger().unregisterIncomingPluginChannel(this);
        getLogger().info("SpigotVManager GUI Companion has been disabled.");
    }
    
    public ServerListUI getServerListUI() {
        return serverListUI;
    }

    public Map<UUID, CreationProcess> getCreationProcesses() {
        return creationProcesses;
    }

    public void startCreationProcess(Player player) {
        creationProcesses.put(player.getUniqueId(), new CreationProcess(player, this));
    }
}
