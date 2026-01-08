.PHONY: public public-stop public-status backend-host backend-stop backend-docker

public:
	@bash scripts/public-url.sh

public-stop:
	@bash scripts/public-url-stop.sh

public-status:
	@host=$$( [ -f .forgequeue/last_hostname ] && cat .forgequeue/last_hostname || echo $${CF_HOSTNAME:-} ); \
	if [ -f .forgequeue/cloudflared.pid ] && ps -p $$(cat .forgequeue/cloudflared.pid) >/dev/null 2>&1; then \
		echo "cloudflared is running (pid $$(cat .forgequeue/cloudflared.pid))"; \
		if [ -n "$$host" ]; then echo "Public URL: https://$$host"; fi; \
	else \
		echo "cloudflared is not running"; \
	fi

backend-host:
	@bash scripts/start-backend.sh

backend-stop:
	@bash scripts/stop-backend.sh

backend-docker:
	@bash run-backend-docker.sh
