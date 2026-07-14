# Trash Grab Express Website & Admin Dashboard Guide

**Live website:** https://trashgrab.app  
**Admin dashboard:** https://trashgrab.app/admin.html

> Keep administrator login credentials private. Share them separately with approved staff; never place a password in this guide, email thread, or GitHub.

## Daily quick start

1. Open the admin dashboard and sign in with an approved administrator account.
2. Review **New** requests and open each record with **View**.
3. Confirm the customer's contact information, address, plan, bin count, and requested date.
4. Set the **Next pickup date**, choose the correct status, add private notes, and select **Save changes**.
5. Open **Route planner**, select the pickup date, and confirm the correct stops are checked.
6. Select **Build best route map**. Review the numbered, optimized route, then select **Start navigation**.
7. After service, change the request to **Completed**, or set the next pickup date and keep a recurring customer **Active**.

## How customers use the website

1. A customer opens https://trashgrab.app.
2. They review the service and pricing information.
3. They complete the pickup request form with their name, contact information, service address, requested date, plan, bin count, and notes.
4. After a successful submission, the request appears in the administrator dashboard as **New**.

If a customer reports that the form did not save, ask them to refresh the page and try once more. Record the browser-console message if the problem continues.

## Dashboard sections

- **All requests:** Every customer request.
- **New:** Requests waiting for first review.
- **Contacted:** Customers who have been contacted but are not yet scheduled.
- **Scheduled:** Confirmed pickups with a pickup date.
- **Active:** Ongoing or recurring customers.
- **Completed:** Finished service records.
- **Route planner:** Builds the pickup route for a selected date.
- **Home base:** Stores the administrator/operator starting address used by the route planner.

Use **Search** to find a customer by name, email, phone, street address, or ZIP code. Select **Refresh** when you need to reload the latest records.

## Managing a pickup request

1. Select **View** beside the customer.
2. Review contact, service, price estimate, requested date, and customer notes.
3. Enter or change the **Next pickup date**.
4. Select the appropriate status.
5. Add private scheduling or access information under **Private admin notes**.
6. Select **Save changes**.

### Deleting a pickup

Select **Delete pickup** only when the record is a duplicate, test, or genuinely should be removed. Confirm the warning carefully. Deletion is permanent and cannot be undone.

## Setting Home Base

1. Select **Home base** from the menu or dashboard header.
2. Enter the operator's name, phone number, street address, city, state, and ZIP code.
3. Choose whether the route should return to Home Base after the final pickup.
4. Select **Save home base**.

Home Base information is private and available only to an approved signed-in administrator.

## Building the route and embedded map

A pickup appears in the Route Planner only when:

- Its status is **Scheduled** or **Active**.
- Its pickup date exactly matches the date selected in the planner.

To build a route:

1. Open **Route planner**.
2. Choose the correct pickup date.
3. Check the stops to include.
4. Select **Build best route map**. Google rearranges the selected pickups into the most efficient stopping order.
5. Review the numbered order and the embedded interactive map.
6. Select **Start navigation** when you are ready to drive.

The dashboard can optimize up to 25 pickups at a time. Google Maps navigation links can carry fewer stops than the optimizer, so routes above 10 pickups open the first route section in Google Maps while the complete numbered order remains visible on the dashboard. Always check the map and customer addresses before driving.

## Recommended operating routine

### Start of day

- Sign in and select **Refresh**.
- Review new customer requests.
- Confirm today's scheduled and active pickups.
- Check that Home Base is correct.
- Build and review the day's route.

### During the route

- Open Google Maps for interactive directions.
- Verify the customer address before leaving each stop.
- Record access issues or customer instructions in private admin notes.

### End of day

- Mark finished one-time pickups **Completed**.
- For recurring customers, enter the next pickup date and keep the status **Active**.
- Resolve or reschedule missed stops.
- Sign out when finished.

## Troubleshooting

### A pickup does not appear in the route

Confirm that the request is **Scheduled** or **Active** and that its pickup date matches the planner date exactly.

### The route button is disabled

Set Home Base, select a date with eligible pickups, and ensure at least one stop is checked.

### The embedded map does not load

The route can still be opened with **Start navigation**. An administrator should confirm that the Google **Maps JavaScript API**, **Routes API**, and **Maps Static API** are enabled. Netlify needs `GOOGLE_MAPS_API_KEY` for server requests and a separate, website-restricted `GOOGLE_MAPS_BROWSER_API_KEY` for the interactive map.

### The dashboard says waypoint optimization instead of Route Optimization

The route is still optimized and safe to use. The advanced Route Optimization API requires three additional private Netlify settings: the Google Cloud project ID, service-account email, and service-account private key. If any are missing or Google temporarily rejects the advanced request, the dashboard automatically uses Routes API waypoint optimization so route planning keeps working.

### Unable to load or save requests

Refresh the dashboard and sign in again. If the problem continues, record the full browser-console error and the time it occurred.

### Login is rejected

Confirm the email and password. The account must also be on the approved administrator list. Do not share or reset someone else's password.

## Security rules

- Use only https://trashgrab.app/admin.html for live administration.
- Never share the Google API key, Supabase keys, passwords, or login tokens.
- Do not place passwords in customer notes or admin notes.
- Give dashboard access only to approved staff.
- Sign out on shared devices.
- Verify the customer's address before launching a route.
- Treat deletion as permanent.

## New administrator handoff checklist

- Provide the dashboard address.
- Provide login credentials through a private channel.
- Confirm the person can sign in.
- Review request statuses and the deletion warning.
- Enter or verify Home Base.
- Create a test scheduled pickup and build a route.
- Show how to open the embedded map in Google Maps.
- Delete the test record.
- Confirm the person knows how to sign out.
