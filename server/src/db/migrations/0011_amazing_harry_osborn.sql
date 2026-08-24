CREATE INDEX "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_pr_idx" ON "reviews" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "agent_runs_pr_idx" ON "agent_runs" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");