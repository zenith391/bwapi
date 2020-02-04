module.exports.run = function(app) {
	app.get("/api/v2/capabilities", function(req, res) {
		res.status(200).json({
			"capabilities": capabilities
		});
	});
}
