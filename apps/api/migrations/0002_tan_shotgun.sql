CREATE TABLE "volume_claims" (
	"name" text PRIMARY KEY NOT NULL,
	"owner_id" uuid,
	"app_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "volume_claims" ADD CONSTRAINT "volume_claims_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;