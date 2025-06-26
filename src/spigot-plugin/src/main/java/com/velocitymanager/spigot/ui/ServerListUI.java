package com.velocitymanager.spigot.ui;

import com.velocitymanager.spigot.SpigotVManager;
import com.velocitymanager.spigot.model.GameServer;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

public class ServerListUI {
    private static final String INVENTORY_TITLE = "Velocity Server Management";
    private final SpigotVManager plugin;
    private final ConcurrentHashMap<String, GameServer> serverCache = new ConcurrentHashMap<>();

    public ServerListUI(SpigotVManager plugin) {
        this.plugin = plugin;
    }

    public String getInventoryTitle() {
        return INVENTORY_TITLE;
    }

    public void open(Player player, List<GameServer> servers) {
        // Cache the servers for later use (e.g., opening action GUI)
        serverCache.clear();
        servers.forEach(server -> serverCache.put(server.name(), server));
        
        int size = (int) Math.ceil(servers.size() / 9.0) * 9;
        if (size == 0) size = 9;
        if (size > 54) size = 54;
        
        Inventory inv = Bukkit.createInventory(null, size, Component.text(INVENTORY_TITLE));
        
        for (GameServer server : servers) {
            inv.addItem(createServerItem(server));
        }
        
        player.openInventory(inv);
    }
    
    public CompletableFuture<Optional<GameServer>> getServerByName(String name) {
        return CompletableFuture.completedFuture(Optional.ofNullable(serverCache.get(name)));
    }

    private ItemStack createServerItem(GameServer server) {
        Material material;
        switch (server.status().toLowerCase()) {
            case "online":
                material = Material.LIME_STAINED_GLASS_PANE;
                break;
            case "offline":
                material = Material.RED_STAINED_GLASS_PANE;
                break;
            case "starting":
            case "restarting":
                material = Material.YELLOW_STAINED_GLASS_PANE;
                break;
            default:
                material = Material.GRAY_STAINED_GLASS_PANE;
                break;
        }

        ItemStack item = new ItemStack(material);
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            meta.displayName(Component.text(server.name(), NamedTextColor.WHITE).decoration(TextDecoration.ITALIC, false));
            List<Component> lore = new ArrayList<>();
            lore.add(Component.text("Status: " + server.status(), NamedTextColor.GRAY));
            lore.add(Component.text("Type: " + server.softwareType() + " " + server.serverVersion(), NamedTextColor.GRAY));
            lore.add(Component.text("Address: " + server.ip() + ":" + server.port(), NamedTextColor.GRAY));
            lore.add(Component.text(""));
            lore.add(Component.text("Click to manage this server", NamedTextColor.AQUA));
            meta.lore(lore);

            PersistentDataContainer data = meta.getPersistentDataContainer();
            data.set(ServerActionUI.SERVER_NAME_KEY, PersistentDataType.STRING, server.name());
            
            item.setItemMeta(meta);
        }
        return item;
    }
}
