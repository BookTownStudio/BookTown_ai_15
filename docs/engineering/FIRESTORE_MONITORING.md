# Firestore Monitoring

## Budget Alerts

Configure GCP billing budget alerts for the BookTown beta project:

- $3 warning
- $4 high
- $5 critical

Notifications must go to the owner email and the engineering operations channel.

## Firestore Read Alerts

Create Cloud Monitoring alerts on Firestore document reads:

- Warning: 50,000 reads/day
- High: 100,000 reads/day
- Critical: 200,000 reads/day
- Emergency: 500,000 reads/day

Emergency should page immediately and trigger a production freeze on maintenance scripts.

## Dashboard Proposal

Admin dashboard cards:

- Reads today
- Reads last 7 days
- Estimated monthly cost
- Top scheduled functions by read count
- Maintenance jobs run in the last 30 days
- Current Firestore risk status: normal, warning, high, critical, emergency

The dashboard must read from exported metrics or monitoring snapshots, not from broad Firestore scans.

