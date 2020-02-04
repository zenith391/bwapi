// Reset the configuration files by downloading them from Linden Labs's API server

const fs = require("fs");
const https = require("https");
const API_SERVER_URL = "https://blocksworld-api.lindenlab.com";

function download(url, callback) {
	https.get(API_SERVER_URL + "/api/v1", function (res) {
		res.on("data", function (data) {
			callback(data);
		});
	}).on("error", function(e) {
		console.error("Could not download " + url);
		console.error(e);
	});
}

download(API_SERVER_URL + "/api/v1/steam-app-remote-configuration", function(data) {
	fs.writeFile("./app_remote_configuration.json", data, function(e) {
		console.error("Could not write 'app_remote_configuration.json'");
		console.error(e);
	});
});

download(API_SERVER_URL + "/api/v1/content-categories-no-ip", function(data) {
	fs.writeFile("./content_categories.json", data, function(e) {
		console.error("Could not write 'content_categories.json'");
		console.error(e);
	});
});

download(API_SERVER_URL + "/api/v1/store/coins_packs", function(data) {
	fs.writeFile("./coin_packs.json", data, function(e) {
		console.error("Could not write 'coin_packs.json'");
		console.error(e);
	});
});