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
import org.bukkit.persistence.PersistentDataType;

import java.util.Collections;

public class ServerActionUI {

    private static final String INVENTORY_TITLE_PREFIX = "Manage: ";
    public static final NamespacedKey SERVER_NAME_KEY = new NamespacedKey("vmanager", "server_name");
    public static final NamespacedKey ACTION_KEY = new NamespacedKey("vmanager", "action");

    public static String getInventoryTitlePrefix() {
        return INVENTORY_TITLE_PREFIX;
    }
    
    public static void open(Player player, GameServer server) {
        Inventory inv = Bukkit.createInventory(null, 27, Component.text(INVENTORY_TITLE_PREFIX + server.name()));

        // Start Button
        inv.setItem(11, createActionButton(
            Material.LIME_WOOL,
            "Start Server",
            server.name(),
            "start",
            server.status().equalsIgnoreCase("Offline")
        ));

        // Stop Button
        inv.setItem(13, createActionButton(
            Material.RED_WOOL,
            "Stop Server",
            server.name(),
            "stop",
            !server.status().equalsIgnoreCase("Offline")
        ));

        // Restart Button
        inv.setItem(15, createActionButton(
            Material.YELLOW_WOOL,
            "Restart Server",
            server.name(),
            "restart",
            !server.status().equalsIgnoreCase("Offline")
        ));

        player.openInventory(inv);
    }
    
    private static ItemStack createActionButton(Material material, String displayName, String serverName, String action, boolean isEnabled) {
        ItemStack item = new ItemStack(isEnabled ? material : Material.GRAY_WOOL);
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            meta.displayName(Component.text(displayName, isEnabled ? NamedTextColor.WHITE : NamedTextColor.GRAY).decoration(TextDecoration.ITALIC, false));
            if (!isEnabled) {
                meta.lore(Collections.singletonList(Component.text("This action is not available in the current server state.", NamedTextColor.DARK_GRAY)));
            }
            PersistentDataContainer data = meta.getPersistentDataContainer();
            if (isEnabled) {
                data.set(SERVER_NAME_KEY, PersistentDataType.STRING, serverName);
                data.set(ACTION_KEY, PersistentDataType.STRING, action);
            }
            item.setItemMeta(meta);
        }
        return item;
    }
}
