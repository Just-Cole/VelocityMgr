
package com.velocitymanager.spigot.ui;

import com.velocitymanager.spigot.SpigotVManager;
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
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class ServerListUI {
    private static final String INVENTORY_TITLE = "Velocity Server Management";
    private static final int ITEMS_PER_PAGE = 28; // 4 rows of 7
    public static final NamespacedKey ACTION_KEY = new NamespacedKey("vmanager", "action");
    public static final NamespacedKey PAGE_KEY = new NamespacedKey("vmanager", "page");

    private final SpigotVManager plugin;
    private final ConcurrentHashMap<UUID, List<GameServer>> playerServerListCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, GameServer> serverCache = new ConcurrentHashMap<>();

    public ServerListUI(SpigotVManager plugin) {
        this.plugin = plugin;
    }

    public String getInventoryTitle() {
        return INVENTORY_TITLE;
    }

    public void open(Player player, List<GameServer> servers, int page) {
        playerServerListCache.put(player.getUniqueId(), servers);
        
        serverCache.clear();
        servers.forEach(server -> serverCache.put(server.name(), server));
        
        int totalPages = (int) Math.ceil((double) servers.size() / ITEMS_PER_PAGE);
        Inventory inv = Bukkit.createInventory(null, 54, Component.text(INVENTORY_TITLE));
        
        ItemStack filler = new ItemStack(Material.GRAY_STAINED_GLASS_PANE);
        ItemMeta fillerMeta = filler.getItemMeta();
        fillerMeta.displayName(Component.text(" "));
        filler.setItemMeta(fillerMeta);
        
        for (int i = 0; i < 54; i++) {
            if (i < 9 || i > 44 || i % 9 == 0 || i % 9 == 8) {
                inv.setItem(i, filler);
            }
        }

        int startIndex = page * ITEMS_PER_PAGE;
        int endIndex = Math.min(startIndex + ITEMS_PER_PAGE, servers.size());
        int[] serverSlots = {
            10, 11, 12, 13, 14, 15, 16,
            19, 20, 21, 22, 23, 24, 25,
            28, 29, 30, 31, 32, 33, 34,
            37, 38, 39, 40, 41, 42, 43
        };

        for (int i = startIndex; i < endIndex; i++) {
            int slotIndex = i - startIndex;
            if(slotIndex < serverSlots.length) {
                inv.setItem(serverSlots[slotIndex], createServerItem(servers.get(i)));
            }
        }

        if (page > 0) {
            inv.setItem(48, createNavButton(Material.ARROW, "Previous Page", "prev_page", page - 1));
        }

        inv.setItem(49, createNavButton(Material.BARRIER, "Close", "close", 0));

        if (page < totalPages - 1) {
            inv.setItem(50, createNavButton(Material.ARROW, "Next Page", "next_page", page + 1));
        }
        
        player.openInventory(inv);
    }
    
    public Optional<GameServer> getServerByName(String name) {
        return Optional.ofNullable(serverCache.get(name));
    }

    public List<GameServer> getCachedServersForPlayer(Player player) {
        return playerServerListCache.getOrDefault(player.getUniqueId(), Collections.emptyList());
    }
    
    private ItemStack createServerItem(GameServer server) {
        ItemStack item = new ItemStack(Material.ITEM_FRAME);
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            meta.displayName(Component.text(server.name(), NamedTextColor.WHITE).decoration(TextDecoration.ITALIC, false));
            
            Component statusComponent;
            switch (server.status().toLowerCase()) {
                case "online":
                    statusComponent = Component.text("Online", NamedTextColor.GREEN);
                    break;
                case "offline":
                    statusComponent = Component.text("Offline", NamedTextColor.RED);
                    break;
                case "starting":
                    statusComponent = Component.text("Starting", NamedTextColor.YELLOW);
                    break;
                case "restarting":
                    statusComponent = Component.text("Restarting", NamedTextColor.GOLD);
                    break;
                case "stopping":
                    statusComponent = Component.text("Stopping", NamedTextColor.GOLD);
                    break;
                default:
                    statusComponent = Component.text(server.status(), NamedTextColor.GRAY);
                    break;
            }

            List<Component> lore = new ArrayList<>();
            lore.add(Component.text("Status: ").color(NamedTextColor.GRAY).append(statusComponent));
            lore.add(Component.text("Type: " + server.softwareType() + " " + server.serverVersion(), NamedTextColor.GRAY));
            lore.add(Component.text("Address: " + server.ip() + ":" + server.port(), NamedTextColor.GRAY));
            lore.add(Component.empty());
            lore.add(Component.text("Click to manage this server", NamedTextColor.AQUA));
            meta.lore(lore);

            PersistentDataContainer data = meta.getPersistentDataContainer();
            data.set(ServerActionUI.SERVER_NAME_KEY, PersistentDataType.STRING, server.name());
            
            item.setItemMeta(meta);
        }
        return item;
    }

    private ItemStack createNavButton(Material material, String name, String action, int page) {
        ItemStack item = new ItemStack(material);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(Component.text(name, NamedTextColor.GOLD).decoration(TextDecoration.ITALIC, false));
        PersistentDataContainer data = meta.getPersistentDataContainer();
        data.set(ACTION_KEY, PersistentDataType.STRING, action);
        data.set(PAGE_KEY, PersistentDataType.INTEGER, page);
        item.setItemMeta(meta);
        return item;
    }
}
