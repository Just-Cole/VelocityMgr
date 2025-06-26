package com.velocitymanager.spigot;

import com.velocitymanager.spigot.commands.ManageGuiCommand;
import com.velocitymanager.spigot.listeners.GuiListener;
import com.velocitymanager.spigot.listeners.PluginMessageListener;
import com.velocitymanager.spigot.ui.ServerListUI;
import org.bukkit.plugin.java.JavaPlugin;

public class SpigotVManager extends JavaPlugin {

    public static final String CHANNEL = "vmanager:main";
    private ServerListUI serverListUI;

    @Override
    public void onEnable() {
        this.serverListUI = new ServerListUI(this);
        
        // Register Command
        this.getCommand("vmanagegui").setExecutor(new ManageGuiCommand(this));

        // Register Event Listeners
        this.getServer().getPluginManager().registerEvents(new GuiListener(this), this);

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
}
