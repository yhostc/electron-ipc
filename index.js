'use strict'
const ID = require('hat').rack()
const handoff = require('handoff')
const electron = require('electron')

const IS_RENDERER = typeof window !== 'undefined' && window.process && window.process.type === 'renderer'
const TARGET = IS_RENDERER ? electron.ipcRenderer : electron.ipcMain

let MESSAGES = {}
let WINDOWS = []

/**
 * 发送IPC消息
 * @private
 * @param  {Object}  args    请求参数
 * @return {Promise}
 */
function sendIPC(targetWin, ...args) {
    // 生成随机ID
    let id = ID()
    return new Promise((resolve, reject) => {
        // 设置缓存请求Promise
        MESSAGES[id] = {
            resolve,
            reject
        }
        if (IS_RENDERER) {
            // 渲染进程，发送请求到主进程
            TARGET.send('handoff.request', id, ...args)
        } else {
            // 主进程，分别发送请求到各渲染进程
            if (targetWin) {
                targetWin.webContents.send('handoff.request', id, ...args)
            } else {
                WINDOWS.forEach(win => win.webContents.send('handoff.request', id, ...args))
            }
        }
    })
}

// 统一监听响应
TARGET.on('handoff.response', (event, id, success, response) => {
    // 获取请求Promise
    let promise = MESSAGES[id]
    if (!promise) throw new Error('Unexpected response...')
    if (success) promise.resolve(response)
    else {
        let err = new Error(response.message)
        err.stack = response.stack
        promise.reject(err)
    }
    delete MESSAGES[id]
})

// 统一监听请求
TARGET.on('handoff.request', (event, id, ...args) => {
    handoff.publish(...args).then(response => {
        // 根据请求返回正常结果
        event.sender.send('handoff.response', id, true, response)
    }).catch(err => {
        // 根据请求返回异常结果
        event.sender.send('handoff.response', id, false, {
            message: err.message,
            stack: err.stack
        })
    })
})

module.exports = {
    /**
     * 注册window
     * @param {[type]} win [description]
     */
    addWindow(win) {
        WINDOWS.push(win)
    },

    /**
     * 销毁window
     * @param  {[type]} win [description]
     * @return {[type]}     [description]
     */
    removeWindow(win) {
        let idx = WINDOWS.indexOf(win)
        if (!~idx) return
        WINDOWS.splice(idx, 1)
    },

    /**
     * 发布消息
     * @public
     * @param  {Object}  args    请求参数
     * @return {Promise}
     */
    publish(...args) {
        return sendIPC(null, ...args)
    },

    /**
     * 定向发布消息
     * @public
     * @param  {Object}  args    请求参数
     * @return {Promise}
     */
    publishTo(win, ...args) {
        return sendIPC(win, ...args)
    },

    /**
     * 订阅消息
     * @public
     * @param  {Object}  args    请求参数
     * @return {Promise}
     */
    subscribe(...args) {
        return handoff.subscribe(...args)
    },

    /**
     * 取消订阅
     * @public
     * @param  {Object}  args    请求参数
     * @return {Promise}
     */
    unsubscribe(...args) {
        return handoff.unsubscribe(...args)
    },

    /**
     * 保留消息
     * @public
     * @param  {Object}  args    请求参数
     * @return {Promise}
     */
    hold(...args) {
        return handoff.hold(...args)
    },

    /**
     * 释放消息
     * @public
     * @param  {Object}  args    请求参数
     * @return {Promise}
     */
    resume(...args) {
        return handoff.resume(...args)
    },

    /**
     * 清空消息
     * @public
     * @param  {Object}  args    请求参数
     * @return {Promise}
     */
    reset(...args) {
        return handoff.__reset(...args)
    }
}