
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

        client.newCall(request).enqueue(new ApiCallback<>(future, new TypeToken<List<GameServer>>() {}.getType(), gson));
        return future;
    }

    public CompletableFuture<String> performServerAction(GameServer server, String action) {
        String jsonBody = gson.toJson(new ServerActionPayload(server.name(), server.serverVersion(), server.softwareType()));
        return postToActionEndpoint("/minecraft/" + action, jsonBody);
    }
    
    public CompletableFuture<String> createServer(String jsonPayload) {
        return postToActionEndpoint("/minecraft/servers", jsonPayload);
    }

    private CompletableFuture<String> postToActionEndpoint(String path, String jsonBody) {
        CompletableFuture<String> future = new CompletableFuture<>();
        RequestBody body = RequestBody.create(jsonBody, MediaType.get("application/json; charset=utf-8"));
        Request request = new Request.Builder().url(baseUrl + path).post(body).build();
        client.newCall(request).enqueue(new ApiCallback<>(future, ActionResponse.class, gson, true));
        return future;
    }

    // --- DTOs for API Payloads and Responses ---
    private record ServerActionPayload(String serverName, String serverVersion, String serverType) {}
    private record ActionResponse(String message, GameServer server) {}
    private record ErrorResponse(String message) {}
    
    // Generic Callback Handler
    private static class ApiCallback<T> implements Callback {
        private final CompletableFuture<T> future;
        private final Type type;
        private final Gson gson;
        private final boolean isActionResponse;

        ApiCallback(CompletableFuture<T> future, Type type, Gson gson, boolean isActionResponse) {
            this.future = future;
            this.type = type;
            this.gson = gson;
            this.isActionResponse = isActionResponse;
        }

        ApiCallback(CompletableFuture<T> future, Type type, Gson gson) {
            this(future, type, gson, false);
        }

        @Override
        public void onFailure(Call call, IOException e) {
            future.completeExceptionally(e);
        }

        @Override
        public void onResponse(Call call, Response response) {
            try (ResponseBody responseBody = response.body()) {
                if (responseBody == null) {
                    future.completeExceptionally(new IOException("Response body was null"));
                    return;
                }
                String bodyString = responseBody.string();
                if (!response.isSuccessful()) {
                    try {
                        ErrorResponse error = gson.fromJson(bodyString, ErrorResponse.class);
                        future.completeExceptionally(new IOException(error.message()));
                    } catch (Exception e) {
                        future.completeExceptionally(new IOException("Request failed with code " + response.code() + ": " + bodyString));
                    }
                } else {
                    try {
                        if (isActionResponse) {
                            ActionResponse actionResponse = gson.fromJson(bodyString, ActionResponse.class);
                            future.complete((T) actionResponse.message());
                        } else {
                            future.complete(gson.fromJson(bodyString, type));
                        }
                    } catch (Exception e) {
                        future.completeExceptionally(new IOException("Failed to parse response: " + bodyString, e));
                    }
                }
            } catch (IOException e) {
                 future.completeExceptionally(e);
            }
        }
    }
}
