/**
	bwapi - Blocksworld API server reimplementation
    Copyright (C) 2020 zenith391

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/
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