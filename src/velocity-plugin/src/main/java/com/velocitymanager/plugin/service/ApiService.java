package com.velocitymanager.plugin.service;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.velocitymanager.plugin.model.GameServer;
import okhttp3.*;

import java.io.IOException;
import java.lang.reflect.Type;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class ApiService {

    private final OkHttpClient client = new OkHttpClient();
    private final Gson gson = new Gson();
    private final String baseUrl;

    public ApiService(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public CompletableFuture<List<GameServer>> fetchServers() {
        CompletableFuture<List<GameServer>> future = new CompletableFuture<>();
        Request request = new Request.Builder()
            .url(baseUrl + "/minecraft/servers")
            .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                future.completeExceptionally(e);
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful()) {
                    future.completeExceptionally(new IOException("Unexpected code " + response));
                    return;
                }
                try (ResponseBody responseBody = response.body()) {
                    if (responseBody == null) {
                         future.completeExceptionally(new IOException("Response body was null"));
                         return;
                    }
                    String body = responseBody.string();
                    Type listType = new TypeToken<List<GameServer>>() {}.getType();
                    List<GameServer> servers = gson.fromJson(body, listType);
                    future.complete(servers);
                }
            }
        });
        return future;
    }

    public CompletableFuture<String> performServerAction(GameServer server, String action) {
        CompletableFuture<String> future = new CompletableFuture<>();
        
        String jsonBody = gson.toJson(new ServerActionPayload(server.name(), server.serverVersion(), server.softwareType()));
        RequestBody body = RequestBody.create(jsonBody, MediaType.get("application/json; charset=utf-8"));
        
        Request request = new Request.Builder()
            .url(baseUrl + "/minecraft/" + action)
            .post(body)
            .build();
            
        client.newCall(request).enqueue(new Callback() {
             @Override
            public void onFailure(Call call, IOException e) {
                future.completeExceptionally(e);
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                try(ResponseBody responseBody = response.body()) {
                    if (responseBody == null) {
                         future.completeExceptionally(new IOException("Response body was null"));
                         return;
                    }
                    String responseString = responseBody.string();
                     if (!response.isSuccessful()) {
                        // Try to parse an error message from the response
                        try {
                            ErrorResponse errorResponse = gson.fromJson(responseString, ErrorResponse.class);
                             future.completeExceptionally(new IOException(errorResponse.message()));
                        } catch (Exception e) {
                             future.completeExceptionally(new IOException("Request failed with status " + response.code() + ": " + responseString));
                        }
                    } else {
                        try {
                            ActionResponse actionResponse = gson.fromJson(responseString, ActionResponse.class);
                            future.complete(actionResponse.message());
                        } catch(Exception e) {
                            future.completeExceptionally(new IOException("Failed to parse successful response: " + responseString));
                        }
                    }
                }
            }
        });

        return future;
    }

    // --- DTOs for API Payloads and Responses ---

    private record ServerActionPayload(String serverName, String serverVersion, String serverType) {}

    private record ActionResponse(String message, GameServer server) {}
    
    private record ErrorResponse(String message) {}
}
