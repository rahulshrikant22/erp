/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "core"."User";

-- CreateTable
CREATE TABLE "core"."users" (
    "id" TEXT NOT NULL,
    "employee_code" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_changed_at" TIMESTAMP(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "user_type" TEXT NOT NULL DEFAULT 'internal',
    "branch_id" TEXT,
    "department_id" TEXT,
    "designation_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret_encrypted" TEXT,
    "backup_codes_encrypted" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_info" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."user_password_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "set_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_password_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."oauth_providers" (
    "id" TEXT NOT NULL,
    "provider_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret_encrypted" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."oauth_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "customer_user_id" TEXT,
    "provider_id" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "access_token_encrypted" TEXT,
    "refresh_token_encrypted" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."mfa_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "device_type" TEXT NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."mfa_recovery_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."login_attempts" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."ip_blocklist" (
    "id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "blocked_until" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "blocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_blocklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."device_fingerprints" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "customer_user_id" TEXT,
    "fingerprint" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_trusted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "device_fingerprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."security_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "user_id" TEXT,
    "details_json" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "registered_address" JSONB,
    "billing_address" JSONB,
    "logo_url" TEXT,
    "primary_email" TEXT,
    "primary_phone" TEXT,
    "financial_year_start_month" INTEGER NOT NULL DEFAULT 4,
    "default_currency" TEXT NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."branches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branch_type" TEXT NOT NULL,
    "gstin" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."departments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."designations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "department_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."locations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location_type" TEXT NOT NULL,
    "address_line1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."roles" (
    "id" TEXT NOT NULL,
    "role_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system_role" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."permissions" (
    "id" TEXT NOT NULL,
    "permission_code" TEXT NOT NULL,
    "module_id" TEXT,
    "feature" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "scope_filter" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."user_permission_overrides" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "grant_type" TEXT NOT NULL,
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."field_visibility_config" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "target_entity" TEXT NOT NULL,
    "field_code" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_visibility_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."data_access_rules" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "target_entity" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "rule_expression" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_access_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."custom_fields" (
    "id" TEXT NOT NULL,
    "target_entity" TEXT NOT NULL,
    "field_code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "options_json" JSONB,
    "validation_rules" JSONB,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."modules" (
    "id" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "is_core" BOOLEAN NOT NULL DEFAULT false,
    "is_bypassable" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "activated_at" TIMESTAMP(3),
    "deactivated_at" TIMESTAMP(3),
    "parent_module_id" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."module_dependencies" (
    "id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "depends_on_module_id" TEXT NOT NULL,
    "is_hard_dependency" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."module_activation_history" (
    "id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "actor_user_id" TEXT,
    "action_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_activation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."workflows" (
    "id" TEXT NOT NULL,
    "workflow_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "target_entity" TEXT NOT NULL,
    "trigger_event" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."workflow_steps" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "step_sequence" INTEGER NOT NULL,
    "step_name" TEXT NOT NULL,
    "step_type" TEXT NOT NULL,
    "assignee_type" TEXT,
    "assignee_value" TEXT,
    "condition_json" JSONB,
    "timeout_minutes" INTEGER,
    "skip_if_module_inactive" BOOLEAN NOT NULL DEFAULT false,
    "target_module_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."workflow_instances" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "target_entity_id" TEXT NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "initiated_by_id" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."workflow_action_logs" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "step_id" TEXT,
    "action_taken" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "workflow_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."audit_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "action" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_ip" TEXT,
    "actor_user_agent" TEXT,
    "before_data" JSONB,
    "after_data" JSONB,
    "changes_summary" TEXT,
    "action_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."dpdp_consents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "customer_user_id" TEXT,
    "consent_type" TEXT NOT NULL,
    "version_id" TEXT,
    "consented_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consent_method" TEXT,
    "ip_address" TEXT,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawal_reason" TEXT,

    CONSTRAINT "dpdp_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."dpdp_data_requests" (
    "id" TEXT NOT NULL,
    "requester_type" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "request_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "processed_by_id" TEXT,
    "response_data_url" TEXT,

    CONSTRAINT "dpdp_data_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."privacy_policy_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privacy_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."terms_of_service_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_of_service_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."email_providers" (
    "id" TEXT NOT NULL,
    "provider_name" TEXT NOT NULL,
    "provider_code" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "email_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."sms_providers" (
    "id" TEXT NOT NULL,
    "provider_name" TEXT NOT NULL,
    "provider_code" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "sender_id" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "sms_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."whatsapp_providers" (
    "id" TEXT NOT NULL,
    "provider_name" TEXT NOT NULL,
    "provider_code" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "phone_number_id" TEXT,
    "business_account_id" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "whatsapp_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."communication_templates" (
    "id" TEXT NOT NULL,
    "template_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject_template" TEXT,
    "body_template" TEXT NOT NULL,
    "variables_schema" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "communication_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."notifications" (
    "id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "notification_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."notification_log" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "email_provider_id" TEXT,
    "recipient_address" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "error_message" TEXT,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."customer_accounts" (
    "id" TEXT NOT NULL,
    "account_code" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "primary_contact_name" TEXT,
    "primary_email" TEXT NOT NULL,
    "primary_phone" TEXT,
    "account_type" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "signup_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "customer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."customer_users" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'regular',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "customer_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."customer_signup_requests" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "account_type" TEXT NOT NULL,
    "business_proof_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,

    CONSTRAINT "customer_signup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."customer_portal_permissions" (
    "id" TEXT NOT NULL,
    "customer_account_id" TEXT NOT NULL,
    "permission_code" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by_id" TEXT,

    CONSTRAINT "customer_portal_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."payment_gateways" (
    "id" TEXT NOT NULL,
    "gateway_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "is_test_mode" BOOLEAN NOT NULL DEFAULT true,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "payment_gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."payment_transactions" (
    "id" TEXT NOT NULL,
    "transaction_code" TEXT NOT NULL,
    "gateway_id" TEXT,
    "payment_mode" TEXT NOT NULL,
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "gateway_transaction_id" TEXT,
    "gateway_payment_id" TEXT,
    "utr_number" TEXT,
    "cheque_number" TEXT,
    "cheque_date" DATE,
    "payer_name" TEXT,
    "notes" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."payment_refunds" (
    "id" TEXT NOT NULL,
    "refund_code" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "gateway_refund_id" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."documents" (
    "id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" BIGINT,
    "mime_type" TEXT,
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "uploaded_by_id" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parent_document_id" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."numbering_series" (
    "id" TEXT NOT NULL,
    "series_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT,
    "year_format" TEXT NOT NULL DEFAULT 'YYYY',
    "separator" TEXT NOT NULL DEFAULT '/',
    "padding_length" INTEGER NOT NULL DEFAULT 4,
    "current_number" INTEGER NOT NULL DEFAULT 0,
    "reset_yearly" BOOLEAN NOT NULL DEFAULT true,
    "last_reset_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "numbering_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."system_settings" (
    "id" TEXT NOT NULL,
    "setting_key" TEXT NOT NULL,
    "setting_value" TEXT,
    "data_type" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "is_user_editable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_code_key" ON "core"."users"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "core"."users"("email");

-- CreateIndex
CREATE INDEX "users_branch_id_idx" ON "core"."users"("branch_id");

-- CreateIndex
CREATE INDEX "users_department_id_idx" ON "core"."users"("department_id");

-- CreateIndex
CREATE INDEX "users_designation_id_idx" ON "core"."users"("designation_id");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "core"."users"("is_active");

-- CreateIndex
CREATE INDEX "users_is_deleted_idx" ON "core"."users"("is_deleted");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "core"."user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_refresh_token_hash_idx" ON "core"."user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "core"."user_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "user_password_history_user_id_idx" ON "core"."user_password_history"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "core"."password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_hash_idx" ON "core"."password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "core"."password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_providers_provider_code_key" ON "core"."oauth_providers"("provider_code");

-- CreateIndex
CREATE INDEX "oauth_providers_is_active_idx" ON "core"."oauth_providers"("is_active");

-- CreateIndex
CREATE INDEX "oauth_connections_user_id_idx" ON "core"."oauth_connections"("user_id");

-- CreateIndex
CREATE INDEX "oauth_connections_customer_user_id_idx" ON "core"."oauth_connections"("customer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_connections_provider_id_provider_user_id_key" ON "core"."oauth_connections"("provider_id", "provider_user_id");

-- CreateIndex
CREATE INDEX "mfa_devices_user_id_idx" ON "core"."mfa_devices"("user_id");

-- CreateIndex
CREATE INDEX "mfa_recovery_codes_user_id_idx" ON "core"."mfa_recovery_codes"("user_id");

-- CreateIndex
CREATE INDEX "login_attempts_identifier_idx" ON "core"."login_attempts"("identifier");

-- CreateIndex
CREATE INDEX "login_attempts_attempt_at_idx" ON "core"."login_attempts"("attempt_at");

-- CreateIndex
CREATE INDEX "ip_blocklist_ip_address_idx" ON "core"."ip_blocklist"("ip_address");

-- CreateIndex
CREATE INDEX "ip_blocklist_blocked_until_idx" ON "core"."ip_blocklist"("blocked_until");

-- CreateIndex
CREATE INDEX "device_fingerprints_user_id_idx" ON "core"."device_fingerprints"("user_id");

-- CreateIndex
CREATE INDEX "device_fingerprints_customer_user_id_idx" ON "core"."device_fingerprints"("customer_user_id");

-- CreateIndex
CREATE INDEX "device_fingerprints_fingerprint_idx" ON "core"."device_fingerprints"("fingerprint");

-- CreateIndex
CREATE INDEX "security_events_event_type_idx" ON "core"."security_events"("event_type");

-- CreateIndex
CREATE INDEX "security_events_severity_idx" ON "core"."security_events"("severity");

-- CreateIndex
CREATE INDEX "security_events_user_id_idx" ON "core"."security_events"("user_id");

-- CreateIndex
CREATE INDEX "security_events_occurred_at_idx" ON "core"."security_events"("occurred_at");

-- CreateIndex
CREATE INDEX "organizations_is_active_idx" ON "core"."organizations"("is_active");

-- CreateIndex
CREATE INDEX "organizations_is_deleted_idx" ON "core"."organizations"("is_deleted");

-- CreateIndex
CREATE INDEX "branches_organization_id_idx" ON "core"."branches"("organization_id");

-- CreateIndex
CREATE INDEX "branches_branch_type_idx" ON "core"."branches"("branch_type");

-- CreateIndex
CREATE INDEX "branches_is_active_idx" ON "core"."branches"("is_active");

-- CreateIndex
CREATE INDEX "branches_is_deleted_idx" ON "core"."branches"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_branch_code_key" ON "core"."branches"("organization_id", "branch_code");

-- CreateIndex
CREATE INDEX "departments_organization_id_idx" ON "core"."departments"("organization_id");

-- CreateIndex
CREATE INDEX "departments_branch_id_idx" ON "core"."departments"("branch_id");

-- CreateIndex
CREATE INDEX "departments_parent_id_idx" ON "core"."departments"("parent_id");

-- CreateIndex
CREATE INDEX "departments_is_active_idx" ON "core"."departments"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_code_key" ON "core"."departments"("organization_id", "code");

-- CreateIndex
CREATE INDEX "designations_organization_id_idx" ON "core"."designations"("organization_id");

-- CreateIndex
CREATE INDEX "designations_department_id_idx" ON "core"."designations"("department_id");

-- CreateIndex
CREATE INDEX "designations_is_active_idx" ON "core"."designations"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "designations_organization_id_code_key" ON "core"."designations"("organization_id", "code");

-- CreateIndex
CREATE INDEX "locations_organization_id_idx" ON "core"."locations"("organization_id");

-- CreateIndex
CREATE INDEX "locations_location_type_idx" ON "core"."locations"("location_type");

-- CreateIndex
CREATE INDEX "locations_is_active_idx" ON "core"."locations"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "locations_organization_id_code_key" ON "core"."locations"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_role_code_key" ON "core"."roles"("role_code");

-- CreateIndex
CREATE INDEX "roles_is_active_idx" ON "core"."roles"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_permission_code_key" ON "core"."permissions"("permission_code");

-- CreateIndex
CREATE INDEX "permissions_module_id_idx" ON "core"."permissions"("module_id");

-- CreateIndex
CREATE INDEX "role_permissions_role_id_idx" ON "core"."role_permissions"("role_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "core"."role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "core"."role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "core"."user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "core"."user_roles"("role_id");

-- CreateIndex
CREATE INDEX "user_roles_is_active_idx" ON "core"."user_roles"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "core"."user_roles"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "user_permission_overrides_user_id_idx" ON "core"."user_permission_overrides"("user_id");

-- CreateIndex
CREATE INDEX "user_permission_overrides_permission_id_idx" ON "core"."user_permission_overrides"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_user_id_permission_id_key" ON "core"."user_permission_overrides"("user_id", "permission_id");

-- CreateIndex
CREATE INDEX "field_visibility_config_role_id_idx" ON "core"."field_visibility_config"("role_id");

-- CreateIndex
CREATE INDEX "field_visibility_config_target_entity_idx" ON "core"."field_visibility_config"("target_entity");

-- CreateIndex
CREATE UNIQUE INDEX "field_visibility_config_role_id_target_entity_field_code_key" ON "core"."field_visibility_config"("role_id", "target_entity", "field_code");

-- CreateIndex
CREATE INDEX "data_access_rules_role_id_idx" ON "core"."data_access_rules"("role_id");

-- CreateIndex
CREATE INDEX "data_access_rules_target_entity_idx" ON "core"."data_access_rules"("target_entity");

-- CreateIndex
CREATE INDEX "custom_fields_target_entity_idx" ON "core"."custom_fields"("target_entity");

-- CreateIndex
CREATE INDEX "custom_fields_is_active_idx" ON "core"."custom_fields"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "custom_fields_target_entity_field_code_key" ON "core"."custom_fields"("target_entity", "field_code");

-- CreateIndex
CREATE UNIQUE INDEX "modules_module_code_key" ON "core"."modules"("module_code");

-- CreateIndex
CREATE INDEX "modules_is_core_idx" ON "core"."modules"("is_core");

-- CreateIndex
CREATE INDEX "modules_is_active_idx" ON "core"."modules"("is_active");

-- CreateIndex
CREATE INDEX "modules_parent_module_id_idx" ON "core"."modules"("parent_module_id");

-- CreateIndex
CREATE INDEX "module_dependencies_module_id_idx" ON "core"."module_dependencies"("module_id");

-- CreateIndex
CREATE INDEX "module_dependencies_depends_on_module_id_idx" ON "core"."module_dependencies"("depends_on_module_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_dependencies_module_id_depends_on_module_id_key" ON "core"."module_dependencies"("module_id", "depends_on_module_id");

-- CreateIndex
CREATE INDEX "module_activation_history_module_id_idx" ON "core"."module_activation_history"("module_id");

-- CreateIndex
CREATE INDEX "module_activation_history_action_at_idx" ON "core"."module_activation_history"("action_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_workflow_code_key" ON "core"."workflows"("workflow_code");

-- CreateIndex
CREATE INDEX "workflows_target_entity_idx" ON "core"."workflows"("target_entity");

-- CreateIndex
CREATE INDEX "workflows_is_active_idx" ON "core"."workflows"("is_active");

-- CreateIndex
CREATE INDEX "workflow_steps_workflow_id_idx" ON "core"."workflow_steps"("workflow_id");

-- CreateIndex
CREATE INDEX "workflow_steps_target_module_id_idx" ON "core"."workflow_steps"("target_module_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflow_id_step_sequence_key" ON "core"."workflow_steps"("workflow_id", "step_sequence");

-- CreateIndex
CREATE INDEX "workflow_instances_workflow_id_idx" ON "core"."workflow_instances"("workflow_id");

-- CreateIndex
CREATE INDEX "workflow_instances_target_entity_id_idx" ON "core"."workflow_instances"("target_entity_id");

-- CreateIndex
CREATE INDEX "workflow_instances_status_idx" ON "core"."workflow_instances"("status");

-- CreateIndex
CREATE INDEX "workflow_action_logs_instance_id_idx" ON "core"."workflow_action_logs"("instance_id");

-- CreateIndex
CREATE INDEX "workflow_action_logs_step_id_idx" ON "core"."workflow_action_logs"("step_id");

-- CreateIndex
CREATE INDEX "workflow_action_logs_action_at_idx" ON "core"."workflow_action_logs"("action_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_idx" ON "core"."audit_logs"("entity_type");

-- CreateIndex
CREATE INDEX "audit_logs_entity_id_idx" ON "core"."audit_logs"("entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "core"."audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "core"."audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_at_idx" ON "core"."audit_logs"("action_at");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "core"."audit_logs"("request_id");

-- CreateIndex
CREATE INDEX "dpdp_consents_user_id_idx" ON "core"."dpdp_consents"("user_id");

-- CreateIndex
CREATE INDEX "dpdp_consents_customer_user_id_idx" ON "core"."dpdp_consents"("customer_user_id");

-- CreateIndex
CREATE INDEX "dpdp_consents_consent_type_idx" ON "core"."dpdp_consents"("consent_type");

-- CreateIndex
CREATE INDEX "dpdp_data_requests_requester_type_requester_id_idx" ON "core"."dpdp_data_requests"("requester_type", "requester_id");

-- CreateIndex
CREATE INDEX "dpdp_data_requests_status_idx" ON "core"."dpdp_data_requests"("status");

-- CreateIndex
CREATE INDEX "privacy_policy_versions_is_active_idx" ON "core"."privacy_policy_versions"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "privacy_policy_versions_version_key" ON "core"."privacy_policy_versions"("version");

-- CreateIndex
CREATE INDEX "terms_of_service_versions_is_active_idx" ON "core"."terms_of_service_versions"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "terms_of_service_versions_version_key" ON "core"."terms_of_service_versions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "email_providers_provider_code_key" ON "core"."email_providers"("provider_code");

-- CreateIndex
CREATE INDEX "email_providers_is_active_idx" ON "core"."email_providers"("is_active");

-- CreateIndex
CREATE INDEX "email_providers_is_primary_idx" ON "core"."email_providers"("is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "sms_providers_provider_code_key" ON "core"."sms_providers"("provider_code");

-- CreateIndex
CREATE INDEX "sms_providers_is_active_idx" ON "core"."sms_providers"("is_active");

-- CreateIndex
CREATE INDEX "sms_providers_is_primary_idx" ON "core"."sms_providers"("is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_providers_provider_code_key" ON "core"."whatsapp_providers"("provider_code");

-- CreateIndex
CREATE INDEX "whatsapp_providers_is_active_idx" ON "core"."whatsapp_providers"("is_active");

-- CreateIndex
CREATE INDEX "whatsapp_providers_is_primary_idx" ON "core"."whatsapp_providers"("is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "communication_templates_template_code_key" ON "core"."communication_templates"("template_code");

-- CreateIndex
CREATE INDEX "communication_templates_channel_idx" ON "core"."communication_templates"("channel");

-- CreateIndex
CREATE INDEX "communication_templates_is_active_idx" ON "core"."communication_templates"("is_active");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_idx" ON "core"."notifications"("recipient_user_id");

-- CreateIndex
CREATE INDEX "notifications_is_read_idx" ON "core"."notifications"("is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "core"."notifications"("created_at");

-- CreateIndex
CREATE INDEX "notification_log_notification_id_idx" ON "core"."notification_log"("notification_id");

-- CreateIndex
CREATE INDEX "notification_log_channel_idx" ON "core"."notification_log"("channel");

-- CreateIndex
CREATE INDEX "notification_log_status_idx" ON "core"."notification_log"("status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounts_account_code_key" ON "core"."customer_accounts"("account_code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounts_signup_request_id_key" ON "core"."customer_accounts"("signup_request_id");

-- CreateIndex
CREATE INDEX "customer_accounts_account_type_idx" ON "core"."customer_accounts"("account_type");

-- CreateIndex
CREATE INDEX "customer_accounts_is_active_idx" ON "core"."customer_accounts"("is_active");

-- CreateIndex
CREATE INDEX "customer_accounts_is_verified_idx" ON "core"."customer_accounts"("is_verified");

-- CreateIndex
CREATE INDEX "customer_accounts_is_deleted_idx" ON "core"."customer_accounts"("is_deleted");

-- CreateIndex
CREATE INDEX "customer_users_customer_account_id_idx" ON "core"."customer_users"("customer_account_id");

-- CreateIndex
CREATE INDEX "customer_users_email_idx" ON "core"."customer_users"("email");

-- CreateIndex
CREATE INDEX "customer_users_is_active_idx" ON "core"."customer_users"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "customer_users_customer_account_id_email_key" ON "core"."customer_users"("customer_account_id", "email");

-- CreateIndex
CREATE INDEX "customer_signup_requests_status_idx" ON "core"."customer_signup_requests"("status");

-- CreateIndex
CREATE INDEX "customer_signup_requests_email_idx" ON "core"."customer_signup_requests"("email");

-- CreateIndex
CREATE INDEX "customer_portal_permissions_customer_account_id_idx" ON "core"."customer_portal_permissions"("customer_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_portal_permissions_customer_account_id_permission__key" ON "core"."customer_portal_permissions"("customer_account_id", "permission_code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateways_gateway_code_key" ON "core"."payment_gateways"("gateway_code");

-- CreateIndex
CREATE INDEX "payment_gateways_is_active_idx" ON "core"."payment_gateways"("is_active");

-- CreateIndex
CREATE INDEX "payment_gateways_is_primary_idx" ON "core"."payment_gateways"("is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_transaction_code_key" ON "core"."payment_transactions"("transaction_code");

-- CreateIndex
CREATE INDEX "payment_transactions_gateway_id_idx" ON "core"."payment_transactions"("gateway_id");

-- CreateIndex
CREATE INDEX "payment_transactions_payment_mode_idx" ON "core"."payment_transactions"("payment_mode");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "core"."payment_transactions"("status");

-- CreateIndex
CREATE INDEX "payment_transactions_related_entity_type_related_entity_id_idx" ON "core"."payment_transactions"("related_entity_type", "related_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_refund_code_key" ON "core"."payment_refunds"("refund_code");

-- CreateIndex
CREATE INDEX "payment_refunds_transaction_id_idx" ON "core"."payment_refunds"("transaction_id");

-- CreateIndex
CREATE INDEX "payment_refunds_status_idx" ON "core"."payment_refunds"("status");

-- CreateIndex
CREATE INDEX "documents_document_type_idx" ON "core"."documents"("document_type");

-- CreateIndex
CREATE INDEX "documents_related_entity_type_related_entity_id_idx" ON "core"."documents"("related_entity_type", "related_entity_id");

-- CreateIndex
CREATE INDEX "documents_parent_document_id_idx" ON "core"."documents"("parent_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "numbering_series_series_code_key" ON "core"."numbering_series"("series_code");

-- CreateIndex
CREATE INDEX "numbering_series_is_active_idx" ON "core"."numbering_series"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_setting_key_key" ON "core"."system_settings"("setting_key");

-- CreateIndex
CREATE INDEX "system_settings_category_idx" ON "core"."system_settings"("category");

-- AddForeignKey
ALTER TABLE "core"."users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "core"."branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "core"."departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."users" ADD CONSTRAINT "users_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "core"."designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_password_history" ADD CONSTRAINT "user_password_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."oauth_connections" ADD CONSTRAINT "oauth_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."oauth_connections" ADD CONSTRAINT "oauth_connections_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "core"."customer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."oauth_connections" ADD CONSTRAINT "oauth_connections_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "core"."oauth_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."mfa_devices" ADD CONSTRAINT "mfa_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."departments" ADD CONSTRAINT "departments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "core"."branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "core"."departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."designations" ADD CONSTRAINT "designations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."designations" ADD CONSTRAINT "designations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "core"."departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "core"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."permissions" ADD CONSTRAINT "permissions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "core"."modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "core"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "core"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."field_visibility_config" ADD CONSTRAINT "field_visibility_config_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."data_access_rules" ADD CONSTRAINT "data_access_rules_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."modules" ADD CONSTRAINT "modules_parent_module_id_fkey" FOREIGN KEY ("parent_module_id") REFERENCES "core"."modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."module_dependencies" ADD CONSTRAINT "module_dependencies_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "core"."modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."module_dependencies" ADD CONSTRAINT "module_dependencies_depends_on_module_id_fkey" FOREIGN KEY ("depends_on_module_id") REFERENCES "core"."modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."module_activation_history" ADD CONSTRAINT "module_activation_history_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "core"."modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "core"."workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."workflow_steps" ADD CONSTRAINT "workflow_steps_target_module_id_fkey" FOREIGN KEY ("target_module_id") REFERENCES "core"."modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."workflow_instances" ADD CONSTRAINT "workflow_instances_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "core"."workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."workflow_action_logs" ADD CONSTRAINT "workflow_action_logs_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "core"."workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."workflow_action_logs" ADD CONSTRAINT "workflow_action_logs_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "core"."workflow_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."dpdp_consents" ADD CONSTRAINT "dpdp_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."dpdp_consents" ADD CONSTRAINT "dpdp_consents_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "core"."customer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."notification_log" ADD CONSTRAINT "notification_log_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "core"."notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."notification_log" ADD CONSTRAINT "notification_log_email_provider_id_fkey" FOREIGN KEY ("email_provider_id") REFERENCES "core"."email_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."customer_accounts" ADD CONSTRAINT "customer_accounts_signup_request_id_fkey" FOREIGN KEY ("signup_request_id") REFERENCES "core"."customer_signup_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."customer_users" ADD CONSTRAINT "customer_users_customer_account_id_fkey" FOREIGN KEY ("customer_account_id") REFERENCES "core"."customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."customer_portal_permissions" ADD CONSTRAINT "customer_portal_permissions_customer_account_id_fkey" FOREIGN KEY ("customer_account_id") REFERENCES "core"."customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."payment_transactions" ADD CONSTRAINT "payment_transactions_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "core"."payment_gateways"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."payment_refunds" ADD CONSTRAINT "payment_refunds_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "core"."payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."documents" ADD CONSTRAINT "documents_parent_document_id_fkey" FOREIGN KEY ("parent_document_id") REFERENCES "core"."documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
