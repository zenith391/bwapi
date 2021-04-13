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
import url from "url";

const latestVersion = "0.6.0";
const latestVersionId = (0 << 16) | (6 << 8) | (0); // 0 6 0 in separate bytes

export function run(app) {
	app.get("/api/v2/exdilin/configuration", function(req, res) {
		let query = url.parse(req.url, true).query;
		let version = query.version;

		res.status(200).json({
			"latest_version": latestVersion,
			"latest_version_id": latestVersionId
		});
	});
	
	app.get("/api/v2/ping", function(req, res) {
		res.status(200).json({
			"ok": true
		});
	});

	app.get("/api/v2/exdilin/download", function(req, res) {
		const query = url.parse(req.url, true).query;
		if (query.version) {
			if (query.version != latestVersion) {
				res.status(500).json({
					"error": "download old versions in an upcoming feature"
				});
			} else {
				res.status(200).json({
					"error": "TODO"
				})
			}
		} else {
			res.status(404).json({
				"error": "query required: 'version'"
			})
		}
	})
}
