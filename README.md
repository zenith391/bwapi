# Blocksworld API server
## Setup
To setup the server, just clone (download) this repository and, in the console, execute `npm install` (Node.JS) in server's folder..

The most complex part is doing setup for HTTPS:
- You must have a certificate, you can get one for free from [Let's Encrypt](https://letsencrypt.org)
- You will need to create a directory called `cert` that will contain:
  - `fullchain.pem`: The full chain of your certificate
  - `privkey.pem`: The private key of your certificate

### Configure
To configure the server, check the [README.md](https://github.com/zenith391/bwapi/tree/master/conf/README.md) in the `conf` folder.

## Launching
Now to launch the server you **MUST** have NodeJS installed, when it is installed, you just have to
open the terminal (`cmd.exe` in Start Menu for Windows).
Then do `cd path/to/your/instance` and press Enter.  
Now type `launch.bat` on Windows or `./launch` on Linux and then press Enter.

### License

`bwapi` is under [GPLv3 license](https://github.com/zenith391/bwapi/tree/master/conf/LICENSE)
