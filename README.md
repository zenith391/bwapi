![GitHub](https://img.shields.io/github/license/zenith391/bwapi?style=for-the-badge) ![GitHub](https://img.shields.io/github/stars/zenith391/bwapi?style=for-the-badge) ![GitHub](https://img.shields.io/github/issues/zenith391/bwapi?style=for-the-badge) ![GitHub](https://img.shields.io/github/forks/zenith391/bwapi?style=for-the-badge)

# Blocksworld API server
BWApi aims to be a free to use re-implementation of the Blocksworld Game API, allowing for Players to reconnect with other members of the Blocksworld community!

## Server Installation:
### Ubuntu / Debian

Clone this repository or use the Download ZIP button inside Code button on GitHub.  
Then, install Node.JS and npm (node's package manager):
```sh
sudo apt-get install node npm
npm install
```

You'll also need to install and run the Typescript compiler inside the server folder:
```sh
sudo npm install -g typescript
tsc
```

The most complex part is doing setup for HTTPS (optional):
- You must have a certificate, you can get one for free from [Let's Encrypt](https://letsencrypt.org)
- You will need to create a directory called `cert` that will contain:
  - `fullchain.pem`: The full chain of your certificate
  - `privkey.pem`: The private key of your certificate

### Configure
To configure the server, check the [README.md](https://github.com/zenith391/bwapi/blob/master/conf/README.md) in the `conf` folder.

## Launching
Now to launch the server you **MUST** have NodeJS installed (refer to Setup steps), when it is installed, you just have to open the terminal (`cmd.exe` in Start Menu for Windows).
Then do `cd path/to/your/instance` and press Enter.  
Now type `launch.bat` on Windows or `./launch` on Linux and then press Enter.

### License

`bwapi` is under [GPLv3 license](https://github.com/zenith391/bwapi/tree/master/LICENSE).
