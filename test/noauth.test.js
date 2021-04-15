import assert from "assert";
import { expect } from "chai";
import request from "supertest";
import app from "../main.js";

describe("Unit testing no-authentication on multiple endpoints", () => {

	it("GET /api/v1/current_user/deleted_worlds should return Forbidden status", () => {
		return request(app)
			.get("/api/v1/current_user/deleted_worlds")
			.then((response) => {
				expect(response.status).to.equals(403);
			})
	})

	it("GET /api/v1/current_user/pending_payouts should return Forbidden status", () => {
		return request(app)
			.get("/api/v1/current_user/pending_payouts")
			.then((response) => {
				expect(response.status).to.equals(403);
			})
	})

	it("POST /api/v1/current_user/collected_payouts should return Forbidden status", () => {
		return request(app)
			.post("/api/v1/current_user/collected_payouts")
			.then((response) => {
				expect(response.status).to.equals(403);
			})
	})

	it("GET /api/v1/current_user/worlds should return Forbidden status", () => {
		return request(app)
			.get("/api/v1/current_user/worlds")
			.then((response) => {
				expect(response.status).to.equals(403);
			})
	})

	it("GET /api/v1/current_user/worlds_for_teleport should return Forbidden status", () => {
		return request(app)
			.get("/api/v1/current_user/worlds_for_teleport")
			.then((response) => {
				expect(response.status).to.equals(403);
			})
	})

	it("GET /api/v1/current_user/profile_world should return Forbidden status", () => {
		return request(app)
			.get("/api/v1/current_user/profile_world")
			.then((response) => {
				expect(response.status).to.equals(403);
			})
	})

	it("PUT /api/v1/current_user/profile_world should return Forbidden status", () => {
		return request(app)
			.put("/api/v1/current_user/profile_world")
			.then((response) => {
				expect(response.status).to.equals(403);
			})
	})

	it("POST /api/v1/user/123/follow_activity should return Forbidden status", () => {
		return request(app)
			.post("/api/v1/user/123/follow_activity")
			.then((response) => {
				expect(response.status).to.equals(403);
			})
	})

	it("DELETE /api/v1/user/123/follow_activity should return Forbidden status", () => {
		return request(app)
			.delete("/api/v1/user/123/follow_activity")
			.then((response) => {
				expect(response.status).to.equals(403);
			})
	})

});
