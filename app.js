require('dotenv').config();
const { v4 } = require('uuid');
const http = require('http');
const express = require('express');
const passport = require('passport');
const GitHubStrategy = require('passport-github').Strategy;
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const PORT = 5000;
const server = http.createServer(app);
const { WebSocketServer } = require('ws');
var currentTime = 0;

setInterval(() => {
  if (currentTime < 10) {
    currentTime++;
  } else {
    currentTime = 0;
  }
}, 1000);

mongoose.connect(process.env.MONGO, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.use(
  cors({
    origin: '*',
  })
);
app.use(bodyParser.json());
app.use(passport.initialize());

const userSchema = mongoose.Schema({
  name: String,
  avatar: String,
  githubId: String,
  authToken: String,
});

const User = mongoose.model('user', userSchema);

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK,
    },
    function (accessToken, refreshToken, profile, cb) {
      User.findOne({ githubId: profile.id }, (err, result) => {
        if (err) {
          console.log(err);
        } else {
          if (!result) {
            const user = new User({
              name: profile.displayName,
              githubId: profile.id,
              avatar: `https://avatars.dicebear.com/api/male/${profile.displayName}.svg`,
              authToken: v4(),
            });
            user.save((err) => {
              if (err) {
                console.log(err);
              } else {
                cb(null, user);
              }
            });
          } else {
            cb(null, result);
          }
        }
      });
    }
  )
);

app.get('/sync', (req, res) => {
  res.send({ code: 200, data: currentTime });
});

app.get('/user', (req, res) => {
  if (!req.headers.auth || req.headers.auth.trim() === '') {
    res.status(401).send({ code: 401, data: {} });
  } else {
    User.findOne({ authToken: req.headers.auth }, (err, result) => {
      if (err) {
        console.log(err);
      } else {
        if (!result) {
          res.status(401).send({ code: 401, data: {} });
        } else {
          res.send({ code: 200, data: result });
        }
      }
    });
  }
});

app.get('/auth/github', passport.authenticate('github', { session: false }));

app.get(
  '/auth/github/callback',
  passport.authenticate('github', {
    failureRedirect: '/login',
    session: false,
  }),
  function (req, res) {
    res.redirect(
      `${process.env.CLIENT_URL}/githubClientAuth/${req.user.authToken}`
    );
  }
);

server.listen(process.env.PORT || PORT);

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  ws.on('message', function (message) {
    const { auth, content } = JSON.parse(message);
    if (
      !auth ||
      !content ||
      typeof content !== 'string' ||
      content.trim() === ''
    )
      return;

    User.findOne({ authToken: auth }, (err, profile) => {
      if (err) {
        console.log(err);
      } else {
        if (!profile) return;
        const sendingMessage = {
          name: profile.name,
          avatar: profile.avatar,
          content,
        };
        wss.clients.forEach(function (client) {
          client.send(JSON.stringify(sendingMessage));
        });
      }
    });
  });
});
