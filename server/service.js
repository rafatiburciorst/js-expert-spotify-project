import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import config from './config.js'
import { join, extname } from 'node:path'

const {
    dir: {
        publicDirectory
    }
} = config

export class Service {

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