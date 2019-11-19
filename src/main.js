const { ipcRenderer } = require('electron')
const { exec } = require('child_process')
const path = require('path')

const binPath = path.join(__dirname, '/bin/img2webp')

const accepts = ['png', 'jpg', 'jpeg', 'tiff']
let dragTimer = null

new Vue({
  template: `
    <div id="app">
      <div class="screen" v-if="hasImg">
        <div class="left">
          <transition-group name="flip-list" tag="ol">
            <li
              v-for="(d, i) in imgs"
              :key="d.path"
              class="img"
              draggable
              @dragstart="dragstart(d, $event)"
              @dragenter="dragenter(d, i)"
              @dragend="dragend"
            >
              {{d.path}}
              <p>
                <input draggable @dragstart.prevent.stop type="number" v-model="d.d" :placeholder="'持续时间，默认' + options.d" />
              </p>
            </li>
          </transition-group>

          <p class="tip">可拖动调整顺序</p>
        </div>

        <div class="right">
          <h4>每帧持续时间(ms)</h4>
          <input class="options" type="number" v-model="options.d" />
          <h4>压缩质量(1-100)</h4>
          <input class="options" type="number" v-model="options.q" />
          <h4>循环次数(0为无限)</h4>
          <input class="options" type="number" v-model="options.loop" />

          <div class="btns-wrap">
            <button @click="select">更换图片</button>
            <button class="primary" @click="save">保存</button>
          </div>
        </div>
      </div>

      <div class="screen" v-else>
        <div
          class="select-btn"
          @drop.prevent="onFileDrop"
          @dragover.prevent="dragover = true"
          @dragleave.prevent="dragover = false"
        >
          <i class="cross"></i>
          <p>
            {{dragover ? '松开以选择文件' : '选择多个文件'}}<br />
            支持 png、jpg、tiff 等格式
          </p>
          <button @click="select"></button>
        </div>
      </div>

      <transition name="fade">
        <div class="loading" v-if="loading">
          <div class="base">
            <div class="cube"></div>
            <div class="cube"></div>
            <div class="cube"></div>
            <div class="cube"></div>
            <div class="cube"></div>
            <div class="cube"></div>
            <div class="cube"></div>
            <div class="cube"></div>
            <div class="cube"></div>
          </div>
        </div>
      </transition>
    </div>
  `,
  data() {
    return {
      loading: false,

      imgs: [],

      options: {
        loop: 0,
        d: 48,
        q: 80,
      },

      dragover: false,
    }
  },
  computed: {
    hasImg() {
      return this.imgs && this.imgs.length
    },
  },
  methods: {
    select() {
      ipcRenderer.send('open-dialog', {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Images', extensions: accepts },
        ],
      })
      ipcRenderer.once('selectedItem', this.selectedItem)
    },
    selectedItem(event, res) {
      const { canceled, filePaths } = res
      if (!canceled) {
        this.imgs = filePaths.map(path => ({ path, d: '' }))
      }
    },
    save() {
      if (!this.checkPass()) {
        return this.error('参数错误，请检查')
      }
      const name = this.imgs[0].path.replace(/.+?([^\/]+)\..+?$/, '$1')
      ipcRenderer.send('save-dialog', {
        defaultPath: `${name}.webp`,
      })
      ipcRenderer.once('savePath', this.savePath)
    },
    savePath(event, res) {
      const { canceled, filePath } = res
      if (!canceled && filePath) {
        let cmd = `${binPath} -loop ${this.options.loop} -d ${this.options.d} -lossy -m 5 -q ${this.options.q}`
        this.imgs.forEach((img) => {
          cmd += ` ${img.d > 0 ? ' -d ' + img.d : ''} '${img.path}'`
        })
        cmd += ` -o '${filePath}'`

        this.loading = true
        exec('chmod +x ' + binPath, () => {
          exec(cmd, (error) => {
            this.loading = false
            if (error) {
              this.error(`生成 webp 错误：${error.message}`)
              return
            }
            this.success(`生成 webp 成功`)
          })
        })
      }
    },

    checkPass() {
      return (this.options.loop + '').length > 0 && this.options.loop >= 0
        && (this.options.d + '').length > 0 && this.options.d >= 0
        && (this.options.q + '').length > 0 && this.options.q >= 1
    },

    success(message) {
      ipcRenderer.send('message-dialog', {
        type: 'info',
        message,
      })
    },
    error(message) {
      ipcRenderer.send('message-dialog', {
        type: 'error',
        message,
      })
    },

    dragstart(item, event) {
      event.target.style.opacity = 0.5;
      this.dragItem = item;
      const dragItemIndex = this.imgs.indexOf(this.dragItem);
      // 更新拖拽样式
      this.imgs.splice(dragItemIndex, 1, this.dragItem);
    },

    dragenter(item, i) {
      if (this.dragItem.path === item.path || dragTimer) return;
      const dragItemIndex = this.imgs.indexOf(this.dragItem);
      // 删除老的
      this.imgs.splice(dragItemIndex, 1);
      // 挪新的
      const newIndex = this.imgs.indexOf(item);
      this.imgs.splice(
        i < dragItemIndex ? newIndex : newIndex + 1,
        0,
        this.dragItem);
      dragTimer = setTimeout(() => {
        dragTimer = null
      }, 200)
    },

    dragend(event) {
      event.target.style.opacity = 1;
    },

    onFileDrop(e) {
      this.dragover = false
      const imgs = Array.from(e.dataTransfer.files).filter(file => {
        const extension = /\..+$/.test(file.name) ? file.name.split('.').pop() : ''
        return accepts.some(acceptedType => {
          return extension === acceptedType;
        })
      })
      this.imgs = imgs.map(i => ({ path: i.path, d: '' }))
    },
  },
}).$mount('#app')