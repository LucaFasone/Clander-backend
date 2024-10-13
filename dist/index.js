import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { calendar } from './routes/calendar';
import { authRoute } from './routes/auth';
import { shared } from './routes/shared';
import { modify } from './routes/modify';
import { notifications } from './routes/notifications';
import { createNodeWebSocket } from '@hono/node-ws';
import { getUser } from './kinde';
import { db } from './db';
import { sharedEvents } from './db/schema';
import { eq, or } from 'drizzle-orm';
const app = new Hono();
app.use(logger());
const apiRoutes = app.basePath('/api').route('/calendar', calendar).route("/", authRoute).route('/shared', shared).route('/modify', modify).route('/notifications', notifications);
//i-should put this in another file dunno how 
//this was my frist time implemnt websocket (dont like very much)
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
//this contains the id of the evnts and the users that are in the room
//users can be identified by their id in the Map key
const rooms = new Map();
const wsApp = app.get('/ws', getUser, upgradeWebSocket((c) => ({
    async onOpen(evt, ws) {
        try {
            const event = await db.select().from(sharedEvents).where(or(eq(sharedEvents.sharedFromUserId, c.var.user.id), eq(sharedEvents.sharedToUserId, c.var.user.id)));
            event.forEach(event => {
                if (event.sharedFromUserId === c.var.user.id || event.sharedToUserId === c.var.user.id) {
                    if (!rooms.has(event.eventId)) {
                        rooms.set(event.eventId, new Map());
                    }
                    rooms.get(event.eventId)?.set(c.var.user.id, ws);
                }
            });
        }
        catch (e) {
            console.log(e);
        }
    },
    async onMessage(evt, ws) {
        try {
            const data = JSON.parse(evt.data.toString());
            switch (data.type) {
                case 'join':
                    if (!rooms.has(data.eventId)) {
                        rooms.set(data.eventId, new Map());
                    }
                    rooms.get(data.eventId)?.set(c.var.user.id, ws);
                    if (data.action == 'add')
                        rooms.get(data.eventId)?.forEach(ws => {
                            ws.send(JSON.stringify({ 'action': 'add', month: data.month, year: data.year }));
                        });
                    break;
                case 'update':
                    if (!rooms.has(data.eventId)) {
                        return;
                    }
                    rooms.get(data.eventId)?.forEach(ws => {
                        ws.send(JSON.stringify({ 'action': 'update ', month: data.month, year: data.year }));
                    });
                    break;
                case 'delete':
                    if (!rooms.has(data.eventId)) {
                        return;
                    }
                    rooms.get(data.eventId)?.forEach(ws => {
                        ws.send(JSON.stringify({ 'action': 'update', month: data.month, year: data.year }));
                    });
                    rooms.delete(data.eventId);
                    break;
                case 'deleteUser':
                    if (!rooms.has(data.eventId)) {
                        return;
                    }
                    rooms.get(data.eventId)?.forEach(ws => {
                        ws.send(JSON.stringify({ 'action': 'update', month: data.month, year: data.year }));
                    });
                    for (let [key, value] of rooms?.get(data.eventId)) {
                        if (key === c.var.user.id) {
                            rooms.get(data.eventId)?.delete(key);
                        }
                    }
                    break;
                default:
                    console.log('Error', data, typeof data);
                    break;
            }
        }
        catch (e) {
            console.log(e);
        }
    },
    onError(evt, ws) {
        console.error('WebSocket error:', evt);
    },
})));
injectWebSocket(serve({
    fetch: app.fetch,
}));
console.log('Server running at http://localhost:3000');