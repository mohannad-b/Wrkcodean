### Flow 17: Adjust Committed Volume / Plan Upgrade

**Trigger**: Client changes committed volume or plan (e.g., from 10k → 30k runs/month) in the UI

**Flow Diagram**:
```
User adjusts committed volume slider / input
    ↓
System recomputes effective unit price based on new volume tiers
    ↓
Present preview:
    - New per-unit price
    - Estimated monthly spend
    - Change in total cost
    ↓
User confirms change
    ↓
Check tenant's available credit / billing configuration:
    - Query tenant billing config for:
        * customer_id (Stripe/Payment provider ID)
        * default_payment_method
        * credit_balance (if pre-paid/credit-based model)
    ↓
If increasing committed volume:
    Calculate incremental commitment cost
    ↓
    If pre-paid / credit-based model:
        Check if tenant has sufficient credit for incremental commitment
        If not:
            Charge the card on file OR
            Send user through payment flow to top up credit
            If payment fails: Return error, volume change not applied
    ↓
    If pay-as-you-go but with minimum commitment:
        Ensure payment method is valid
        If needed: Capture additional authorization or charge pro-rated uplift
        If payment fails: Return error, volume change not applied
    ↓
If payment/credit check succeeds:
    Option A: Create new quote (change order):
        Create new quote record:
            - automation_version_id (same)
            - status = 'draft'
            - setup_fee = 0 (no new setup fee for volume change)
            - unit_price = new price based on volume tier
            - estimated_volume = new committed volume
            - effective_unit_price = calculated with volume discounts
        ↓
        Client signs new quote (reuse Flow 15 mechanics)
    ↓
    Option B: Create pricing override:
        Create pricing_override record:
            - automation_version_id
            - unit_price_override = new price
            - reason = "Volume upgrade: {old_volume} → {new_volume}"
            - effective_date = next billing period start
        ↓
    Update future billing calculations:
        - Use new effective_unit_price for periods after change date
        - Keep old pricing for current period
    ↓
    If decreasing volume below current period usage:
        Warn user: "Current usage exceeds new committed volume"
        Enforce new limit at next period start
    ↓
    Create audit log entry
    ↓
    Send notifications
    ↓
    Return success
```

**Note**: If the new volume implies higher minimum monthly commitment or upfront commitment, validate there is enough balance / credit. If not, charge the user's default payment method (or require payment) before applying the new pricing/volume. If payment fails, the volume change is not applied and the user is notified.

**API Endpoints**:
- `POST /v1/automation-versions/{id}/volume-adjustment` - Adjust committed volume
- `GET /v1/automation-versions/{id}/pricing-preview` - Preview pricing for new volume

**Database Changes**:
- Option A: Insert into `quotes` (new change order quote)
- Option B: Insert into `pricing_overrides` (automation_version_id, unit_price_override, reason, effective_date)
- Update billing logic to use new effective_unit_price for future periods
- Insert into `audit_logs` (action_type='volume_adjustment')

**Notifications**:
- **Email**: Plan changed / committed volume updated (template: `volume_adjustment`, to client and ops)
- **Email**: Volume decrease warning (template: `volume_decrease_warning`, if decreasing below current usage)

**Exceptions**:
- **Decreasing volume below current period usage**: Return 400 with warning, allow but enforce at next period
- **Invalid volume value**: Return 400
- **Automation version not found**: Return 404
- **No active quote or pricing**: Return 400, must have existing pricing to adjust

**Manual Intervention**: 
- Ops team may manually approve large volume increases
- Ops team reviews volume decreases that exceed current usage

**Note**: Billing logic uses `effective_unit_price` from the latest active quote or override. Volume changes can be implemented via new quotes (change orders) or pricing overrides, depending on business rules.

---
