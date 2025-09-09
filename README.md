# Video Calling App

A real-time video calling application with chat functionality and invitation codes, built with React, TypeScript, Tailwind CSS, and Socket.IO.

## Features

- 🎥 **Real-time video calling** using WebRTC
- 💬 **Live chat** with Socket.IO
- 🔗 **Invitation codes** for easy room joining
- 🎛️ **Media controls** (mute/unmute audio/video)
- 📱 **Responsive design** with Tailwind CSS
- ⚡ **Fast and snappy** performance

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express.js, Socket.IO
- **Real-time**: WebRTC for video/audio, Socket.IO for signaling
- **Styling**: Tailwind CSS for modern UI

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Install all dependencies:**
   ```bash
   npm run install-all
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

   This will start both the backend server (port 5001) and frontend development server (port 3000).

3. **Open your browser:**
   Navigate to `http://localhost:3000`

### Production Build

1. **Build the frontend:**
   ```bash
   npm run build
   ```

2. **Start the production server:**
   ```bash
   npm start
   ```

## How to Use

### Creating a Room

1. Enter your name in the input field
2. Click "Create Room" to generate a unique room code
3. Share the room code with others to invite them

### Joining a Room

1. Enter your name and the room code
2. Click "Join Room" to enter the call
3. Allow camera and microphone permissions when prompted

### During a Call

- **Toggle Video**: Click the video button to turn camera on/off
- **Toggle Audio**: Click the microphone button to mute/unmute
- **Chat**: Use the chat panel on the right to send messages
- **Leave**: Click "Leave Call" to exit the room

## Features in Detail

### Real-time Communication
- WebRTC peer-to-peer connections for video/audio
- Socket.IO for signaling and chat messages
- Automatic connection management

### Invitation System
- 6-character room codes (e.g., "ABC123")
- Easy sharing and joining
- Room persistence until all users leave

### Modern UI
- Clean, professional design
- Responsive layout for all screen sizes
- Intuitive controls and feedback
- Dark theme optimized for video calls

### Performance
- Optimized for speed and responsiveness
- Efficient WebRTC connection handling
- Minimal resource usage

## Browser Support

- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge

**Note**: WebRTC requires HTTPS in production environments.

## Development

### Project Structure

```
calling-app/
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.tsx        # Main application component
│   │   ├── App.css        # Custom styles
│   │   └── index.css      # Tailwind CSS imports
│   ├── public/            # Static assets
│   └── package.json       # Frontend dependencies
├── server/                # Express backend
│   └── index.js          # Server with Socket.IO
├── package.json          # Root dependencies and scripts
└── README.md            # This file
```

### Available Scripts

- `npm run dev` - Start development servers
- `npm run server` - Start backend only
- `npm run client` - Start frontend only
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run install-all` - Install all dependencies

## Troubleshooting

### Common Issues

1. **Camera/Microphone not working:**
   - Ensure you've granted permissions
   - Check if another app is using the camera
   - Try refreshing the page

2. **Can't join room:**
   - Verify the room code is correct
   - Check if the room still exists
   - Ensure you're connected to the internet

3. **Video not showing:**
   - Check browser console for errors
   - Ensure WebRTC is supported
   - Try using Chrome/Chromium

### Development Issues

1. **Port conflicts:**
   - Backend runs on port 5001
   - Frontend runs on port 3000
   - Change ports in package.json if needed

2. **Socket.IO connection issues:**
   - Check if backend server is running
   - Verify CORS settings in server/index.js

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions, please check the troubleshooting section above or create an issue in the repository.
