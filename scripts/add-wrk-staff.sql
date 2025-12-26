-- Script to add Wrk staff members
-- Usage: Replace USER_EMAIL with the actual email of the user you want to make Wrk staff
-- Replace ROLE with one of: 'wrk_admin', 'wrk_operator', 'wrk_viewer'

-- Example: Make a user a Wrk admin
-- First, find the user ID by email:
-- SELECT id, email, name FROM users WHERE email = 'user@example.com';

-- Then insert into wrk_staff_memberships:
-- INSERT INTO wrk_staff_memberships (user_id, role)
-- SELECT id, 'wrk_admin'::wrk_staff_role
-- FROM users
-- WHERE email = 'user@example.com'
-- ON CONFLICT (user_id) DO UPDATE SET role = 'wrk_admin'::wrk_staff_role;

-- Or use this template function:
-- Function to add Wrk staff (run this in psql or your DB client)
DO $$
DECLARE
    target_email TEXT := 'YOUR_EMAIL_HERE'; -- Replace with actual email
    target_role TEXT := 'wrk_admin'; -- Options: 'wrk_admin', 'wrk_operator', 'wrk_viewer'
    user_uuid UUID;
BEGIN
    -- Find user by email
    SELECT id INTO user_uuid FROM users WHERE email = target_email;
    
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION 'User with email % not found', target_email;
    END IF;
    
    -- Insert or update Wrk staff membership
    INSERT INTO wrk_staff_memberships (user_id, role)
    VALUES (user_uuid, target_role::wrk_staff_role)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        role = target_role::wrk_staff_role,
        updated_at = NOW();
    
    RAISE NOTICE 'Successfully added/updated Wrk staff membership for user % with role %', target_email, target_role;
END $$;

