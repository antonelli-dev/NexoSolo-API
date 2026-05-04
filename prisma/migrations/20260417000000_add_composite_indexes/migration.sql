-- AddIndex: Composite indexes for N+1 query optimization
-- These accelerate common WHERE clauses like: where.userId AND where.id
-- or where.userId AND where.clientId

-- clients table: speed up (userId, id) lookups in clientTimeline()
CREATE INDEX "clients_user_id_id_idx" ON "clients"("user_id", "id");

-- projects table: speed up (userId, id) and (userId, clientId) lookups
CREATE INDEX "projects_user_id_id_idx" ON "projects"("user_id", "id");
CREATE INDEX "projects_user_id_client_id_idx" ON "projects"("user_id", "client_id");

-- invoices table: speed up (projectId, status) for status filtering
CREATE INDEX "invoices_project_id_status_idx" ON "invoices"("project_id", "status");

-- client_activities table: speed up (userId, clientId) lookups
CREATE INDEX "client_activities_user_id_client_id_idx" ON "client_activities"("user_id", "client_id");

-- quotes table: speed up (userId, clientId) lookups
CREATE INDEX "quotes_user_id_client_id_idx" ON "quotes"("user_id", "client_id");
