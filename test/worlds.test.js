import assert from "assert";
import { expect } from "chai";
import request from "supertest";
import app from "../app.js";
import fs from "fs";

describe("Unit testing getting a non-existent world (id 123456789)", () => {

	it("should return Not Found status", () => {
		return request(app)
			.get("/api/v1/worlds/123456789")
			.then((response) => {
				expect(response.status).to.equals(404);
			})
	})

});

describe("World listing", () => {

	beforeEach(() => {
		invalidateWorldCache();
	})

	it("On empty dataset", () => {
		return request(app)
			.get("/api/v1/worlds")
			.then((response) => {
				const json = JSON.parse(response.text)
				expect(json).to.deep.equals({
					worlds: [],
					pagination_next_page: null
				})
			})
	})

	it("With one world", () => {
		fs.renameSync("worlds", "worlds_old");
		fs.mkdirSync("worlds/1", { recursive: true });

		const world = {
			"title": "Test World",
			"average_star_rating": 3.5,
			"description": "This world is for testing purposes.",
			"has_win_condition": false,
			"category_ids": [],
			"author_id": 0,
			"app_version": "1.47.0",
			"publication_status": 1,
			"likes_count": 5,
			"play_count": 384,
			"pay_to_play_cost": 1,
			"image_urls_for_sizes": {
				"440x440": "https://bwsecondary.ddns.net:8080/images/239.png",
				"512x384": "https://bwsecondary.ddns.net:8080/images/239.png",
				"220x220": "https://bwsecondary.ddns.net:8080/images/239.png",
				"1024x768": "https://bwsecondary.ddns.net:8080/images/239.png"
			},
			"created_at": "2021-04-10T23:58:41+00:00",
			"first_published_at": "2021-04-10T23:58:41+00:00",
			"updated_at": "2021-04-10T23:58:41+00:00"
		};
		fs.writeFileSync("worlds/1/metadata.json", JSON.stringify(world));
		return request(app)
			.get("/api/v1/worlds")
			.then((response) => {
				fs.rmdirSync("worlds", { recursive: true });
				fs.renameSync("worlds_old", "worlds")
				const json = JSON.parse(response.text)
				expect(json).to.deep.equal({
					worlds: [{
						"title": "Test World",
						"id": 1,
						"average_star_rating": 3.5,
						"description": "This world is for testing purposes.",
						"category_ids": [],
						"author_id": 0,
						"author_username": "Corrupted",
						"author_profile_image_url": "corrupted",
						"author_status": 0,
						"author_blocksworld_premium": false,
						"author_account_type": "user",
						"app_version": "1.47.0",
						"publication_status": 1,
						"likes_count": 5,
						"play_count": 384,
						"pay_to_play_cost": 1,
						"image_urls_for_sizes": {
							"440x440": "https://bwsecondary.ddns.net:8080/images/239.png",
							"512x384": "https://bwsecondary.ddns.net:8080/images/239.png",
							"220x220": "https://bwsecondary.ddns.net:8080/images/239.png",
							"1024x768": "https://bwsecondary.ddns.net:8080/images/239.png"
						},
						"created_at": "2021-04-10T23:58:41+00:00",
						"first_published_at": "2021-04-10T23:58:41+00:00",
						"updated_at": "2021-04-10T23:58:41+00:00",
						"required_mods": []
					}],
					pagination_next_page: null
				})
			})
	})
})