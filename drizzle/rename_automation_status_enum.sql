DO $$
BEGIN
  ALTER TYPE automation_status RENAME VALUE 'Intake' TO 'IntakeInProgress';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE automation_status RENAME VALUE 'Needs Pricing' TO 'NeedsPricing';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE automation_status RENAME VALUE 'Awaiting Approval' TO 'AwaitingClientApproval';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;


