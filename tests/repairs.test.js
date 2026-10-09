const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const path = require('node:path');
const User = require('../models/User');
const Post = require('../models/Post');
const Story = require('../models/Story');
const Reel = require('../models/Reel');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const cloudinary = require('../config/cloudinary');
const userController = require('../controllers/userController');
const storyController = require('../controllers/storyController');
const postController = require('../controllers/postController');
const messageController = require('../controllers/messageController');
const reelController = require('../controllers/reelController');
const notificationController = require('../controllers/notificationController');
function chain(value) {
 const q = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
 for (const key of ['select', 'populate', 'sort', 'skip', 'limit']) q[key] = () => q;
 return q;
}
function response() { return { status(n) { this.code=n;return this; }, json(body) { this.body=body;return this; } }; }
const user = new User({ username:'tester', fullName:'Tester', email:'test@example.test', password:'hash' });
const req = () => ({user,query:{},params:{},body:{},app:{get:()=>undefined}});
test('profile update persists validated fields and hides credentials', async t => {
 t.mock.method(User,'findById',()=>chain(user));
 t.mock.method(user,'save',async()=>user);
 const res=response(); await userController.update({...req(),body:{fullName:'Tanuj',gender:'Male',isPrivate:false}},res);
 assert.equal(user.fullName,'Tanuj'); assert.equal(res.body.data.user.gender,'Male'); assert.equal(res.body.data.user.password,undefined);
});
test('feed pagination and post comments schema work',async t=>{
 t.mock.method(User,'find',()=>chain([user]));
 t.mock.method(Post,'find',()=>chain([{_id:'p1'}, {_id:'p2'}]));
 const res=response();await postController.list({...req(),query:{limit:'1'}},res);
 assert.equal(res.body.data.posts.length,1);assert.equal(res.body.data.hasMore,true);assert.ok(Post.schema.path('comments'));
});
test('conversation list uses the expected response fields',async t=>{
 t.mock.method(Conversation,'find',()=>chain([{_id:'c1'}]));
 const res=response();await messageController.list(req(),res);
 assert.equal(res.body.data.conversations[0]._id,'c1');assert.equal(res.body.data.hasMore,false);
});
test('notifications populate a declared actor and return unread count',async t=>{
 assert.ok(Notification.schema.path('actor'));
 t.mock.method(Notification,'find',()=>chain([{_id:'n1'}]));
 t.mock.method(Notification,'countDocuments',async()=>1);
 const res=response();await notificationController.list(req(),res);
 assert.equal(res.body.data.unread,1);assert.equal(res.body.data.notifications.length,1);
});
test('reel save is separate from like and returns saved state',async t=>{
 t.mock.method(Reel,'findById',()=>chain({user}));
 let change;t.mock.method(User,'updateOne',async(filter,update)=>{change=update;});
 const res=response();await reelController.save({...req(),method:'PUT',params:{id:'reel1'}},res);
 assert.equal(change.$addToSet.savedReels,'reel1');assert.equal(res.body.data.saved,true);
});
test('real PNG upload validation and story creation use correct names',async t=>{
 t.mock.method(cloudinary.uploader,'upload_stream',(options,callback)=>{
  const stream=new PassThrough();stream.resume();stream.on('finish',()=>callback(null,{secure_url:'https://example.test/story.png',public_id:'test',resource_type:'image'}));return stream;
 });
 const story={populate:async()=>{}};
 t.mock.method(Story,'create',async data=>{Object.assign(story,data);return story;});
 const res=response();await storyController.create({...req(),file:{mimetype:'image/png',buffer:fs.readFileSync(path.join(__dirname,'../seed-assets/moment-1.png'))}},res);
 assert.equal(res.code,201);assert.equal(res.body.data.story.media.type,'image');assert.ok(story.expiresAt>Date.now());
});
