
package com.velocitymanager.spigot.ui;

import com.velocitymanager.spigot.model.GameServer;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

import java.util.ArrayList;
import java.util.List;

public class ServerActionUI {

    private static final String INVENTORY_TITLE_PREFIX = "Manage Server: ";
    public static final NamespacedKey SERVER_NAME_KEY = new NamespacedKey("vmanager", "server_name");
    public static final NamespacedKey ACTION_KEY = new NamespacedKey("vmanager", "action");

    public static String getInventoryTitlePrefix() {
        return INVENTORY_TITLE_PREFIX;
    }
    
    public static void open(Player player, GameServer server) {
        Inventory inv = Bukkit.createInventory(null, 27, Component.text(INVENTORY_TITLE_PREFIX + server.name()));

        // Filler
        ItemStack filler = new ItemStack(Material.GRAY_STAINED_GLASS_PANE);
        ItemMeta fillerMeta = filler.getItemMeta();
        fillerMeta.displayName(Component.text(" "));
        filler.setItemMeta(fillerMeta);
        for(int i = 0; i < 27; i++) {
             if (i < 9 || i > 17 || i % 9 == 0 || i % 9 == 8) {
                inv.setItem(i, filler);
             }
        }
        
        boolean isOnline = server.status().equalsIgnoreCase("Online");
        boolean isOffline = server.status().equalsIgnoreCase("Offline");
        
        // Info Item
        inv.setItem(4, createServerInfoItem(server));

        // Start Button
        inv.setItem(11, createActionButton(
            Material.LIME_CONCRETE,
            "Start Server",
            server.name(),
            "start",
            isOffline,
            "Server is offline and can be started."
        ));

        // Stop Button
        inv.setItem(13, createActionButton(
            Material.RED_CONCRETE,
            "Stop Server",
            server.name(),
            "stop",
            isOnline,
            "Server is online and can be stopped."
        ));

        // Restart Button
        inv.setItem(15, createActionButton(
            Material.YELLOW_CONCRETE,
            "Restart Server",
            server.name(),
            "restart",
            isOnline,
            "Server is online and can be restarted."
        ));
        
        // Back Button
        ItemStack backButton = new ItemStack(Material.ARROW);
        ItemMeta backMeta = backButton.getItemMeta();
        backMeta.displayName(Component.text("Back to Server List", NamedTextColor.GOLD).decoration(TextDecoration.ITALIC, false));
        PersistentDataContainer backData = backMeta.getPersistentDataContainer();
        backData.set(ACTION_KEY, PersistentDataType.STRING, "back");
        backButton.setItemMeta(backMeta);
        inv.setItem(18, backButton);

        player.openInventory(inv);
    }
    
    private static ItemStack createActionButton(Material material, String displayName, String serverName, String action, boolean isEnabled, String description) {
        ItemStack item = new ItemStack(isEnabled ? material : Material.GRAY_CONCRETE);
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            meta.displayName(Component.text(displayName, isEnabled ? NamedTextColor.WHITE : NamedTextColor.GRAY).decoration(TextDecoration.ITALIC, false));
            
            List<Component> lore = new ArrayList<>();
            lore.add(Component.text(isEnabled ? description : "Action unavailable in current state.", NamedTextColor.DARK_GRAY));
            meta.lore(lore);
            
            PersistentDataContainer data = meta.getPersistentDataContainer();
            if (isEnabled) {
                data.set(SERVER_NAME_KEY, PersistentDataType.STRING, serverName);
                data.set(ACTION_KEY, PersistentDataType.STRING, action);
            }
            item.setItemMeta(meta);
        }
        return item;
    }
    
    private static ItemStack createServerInfoItem(GameServer server) {
        ItemStack item = new ItemStack(Material.PAPER);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(Component.text(server.name(), NamedTextColor.AQUA, TextDecoration.BOLD));
        List<Component> lore = new ArrayList<>();
        lore.add(Component.text("Status: " + server.status(), NamedTextColor.GRAY));
        lore.add(Component.text("Type: " + server.softwareType(), NamedTextColor.GRAY));
        lore.add(Component.text("Version: " + server.serverVersion(), NamedTextColor.GRAY));
        lore.add(Component.text("Address: " + server.ip() + ":" + server.port(), NamedTextColor.GRAY));
        meta.lore(lore);
        item.setItemMeta(meta);
        return item;
    }
}
