import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import config from './config.js'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PassThrough, Writable } from 'stream'
import Throttle from 'throttle'
import child_process from 'node:child_process'
import { logger } from './util.js'
import { pipeline } from 'node:stream/promises'
import { once } from 'node:events'

const {
    dir: {
        publicDirectory
    },
    constants: {
        fallbackBitRate,
        englishConversation,
        bitRateDivisor
    }
} = config

export class Service {

    constructor() {
        this.clientStream = new Map()
        this.currentSong = englishConversation
        this.currentBitRate = 0
        this.throttleTransform = {}
        this.currentReadable = {}
        this.startStream()
    }

    createClientStream() {
        const id = randomUUID()
        const clientStream = new PassThrough()
        this.clientStream.set(id, clientStream)

        return {
            id,
            clientStream
        }
    }

    removeClientStream(id) {
        this.clientStream.delete(id)
    }

    _executeSoxCommands(args) {
        return child_process.spawn('sox', args)
    }

    async getBitRate(song) {
        try {
            const args = [
                '--i',
                '-B',
                song
            ]

            const {
                stderr, //errors
                stdout, //logs
                // stdin //envio de dados como stream
            } = this._executeSoxCommands(args)

            await Promise.all([
                once(stderr, 'readable'),
                once(stdout, 'readable')
            ])

            const [success, error] = [stdout, stderr].map(stream => stream.read())

            if (error) return await Promise.reject(error)

            return success
                .toString()
                .trim()
                .replace(/k/, '000')

        } catch (error) {
            logger.error(`deu ruim no bitrate ${error}`)
            return fallbackBitRate
        }
    }

    broadCast() {
        return new Writable({
            write: (chunk, enc, cb) => {
                for (const [id, stream] of this.clientStream) {
                    //verifica se o cliente foi desconectado
                    if (stream.writableEnded) {
                        this.clientStream.delete(id)
                        continue
                    }
                    stream.write(chunk)
                }
                cb()
            }
        })
    }

    async startStream() {
        logger.info(`starting with ${this.currentSong}`)
        const bitRate = this.currentBitRate = (await this.getBitRate(this.currentSong)) / bitRateDivisor
        const throttleTransform = this.throttleTransform = new Throttle(bitRate)
        const songReadable = this.currentReadable = this.createFileStream(this.currentSong)
        return pipeline(
            songReadable,
            throttleTransform,
            this.broadCast()
        )
    }

    createFileStream(filename) {
        return createReadStream(filename)
    }

    async getFileInfo(file) {
        const fullFilePath = join(publicDirectory, file)
        await access(fullFilePath)
        const fileType = extname(fullFilePath)

        return {
            type: fileType,
            name: fullFilePath
        }
    }


    async getFileStream(file) {
        const {
            name,
            type
        } = await this.getFileInfo(file)
        return {
            stream: this.createFileStream(name),
            type
        }
    }
}