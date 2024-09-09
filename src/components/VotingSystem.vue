<template>
  <div class="voting-system">
    <h1>{{ title }}</h1>
    
    <!-- 暱稱輸入 -->
    <div v-if="!nickname" class="nickname-input">
      <input v-model="inputNickname" placeholder="請輸入您的暱稱" @keyup.enter="setNickname" />
      <button @click="setNickname">確認</button>
    </div>
    
    <!-- 主要功能區 -->
    <div v-else>
      <p>歡迎，{{ nickname }}!</p>
      
      <!-- 投票列表 -->
      <div v-if="!isCreatingVote && !viewingPdf && !viewing3dModel && !viewingVoteDetails" class="vote-list">
        <h2>當前投票</h2>
        <ul>
          <li v-for="vote in votes" :key="vote.id" class="vote-item">
            <div class="vote-title">{{ vote.title }}</div>
            <div class="vote-count">票數: {{ vote.totalVotes }}</div>
            <div class="vote-actions">
              <button @click="viewPdf(vote.id)" v-if="vote.pdfFilename">查看 PDF</button>
              <button @click="view3dModel(vote.id)" v-if="vote.objFilename || vote.glbFilename">查看 3D 模型</button>
              <button @click="viewVoteDetails(vote.id)">詳細資訊</button>
              <button 
                v-if="!hasVoted(vote.id)" 
                @click="openVotingModal(vote)"
              >
                投票
              </button>
              <button 
                v-else
                disabled
              >
                已投票
              </button>
            </div>
          </li>
        </ul>
        <button @click="isCreatingVote = true">建立新投票</button>
      </div>
      
      <!-- 建立投票表單 -->
      <div v-if="isCreatingVote" class="create-vote">
        <h2>建立新投票</h2>
        <input v-model="newVoteTitle" placeholder="投票標題" />
        <div>
          <label>上傳 PDF 文件 (選填):</label>
          <input type="file" @change="handlePdfUpload" accept="application/pdf" />
        </div>
        <div>
          <label>上傳 3D 模型文件 (選填):</label>
          <input type="file" @change="handle3dModelUpload" accept=".obj,.glb" />
        </div>
        <div v-for="(option, index) in newVoteOptions" :key="index" class="option-input">
          <input v-model="option.text" placeholder="選項內容" />
          <input v-model="option.reason" placeholder="選項理由" />
          <button @click="removeOption(index)">移除選項</button>
        </div>
        <button @click="addOption">新增選項</button>
        <button @click="createVote" :disabled="!newVoteTitle || newVoteOptions.length === 0">確認建立</button>
        <button @click="cancelCreateVote">取消</button>
      </div>
      
      <!-- 投票詳細資訊 -->
      <div v-if="viewingVoteDetails" class="vote-details">
        <h2>{{ currentVote.title }}</h2>
        <ul>
          <li v-for="option in currentVote.options" :key="option.id" class="option-detail">
            <div class="option-text">{{ option.text }}</div>
            <div class="option-votes">票數: {{ option.votes }}</div>
            <div class="option-percentage">百分比: {{ option.percentage }}%</div>
            <div class="option-reason">理由: {{ option.reason }}</div>
          </li>
        </ul>
        <button @click="closeVoteDetails">關閉</button>
      </div>
      
      <!-- PDF 預覽 -->
      <div v-if="viewingPdf" class="pdf-preview">
        <h2>PDF 預覽</h2>
        <div ref="pdfPreview" class="pdf-container"></div>
        <div v-if="pdfError" class="error-message">{{ pdfError }}</div>
        <div v-else class="pdf-navigation">
          <button @click="previousPage" :disabled="currentPage === 1">上一頁</button>
          <span>第 {{ currentPage }} 頁，共 {{ totalPages }} 頁</span>
          <button @click="nextPage" :disabled="currentPage === totalPages">下一頁</button>
        </div>
        <button @click="closePreview">關閉預覽</button>
      </div>

      <!-- 3D 模型預覽 -->
      <div v-if="viewing3dModel" class="model-preview">
        <h2>3D 模型預覽</h2>
        <div ref="modelContainer" class="model-container"></div>
        <div class="model-controls">
          <div class="control-group">
            <button @click="setControlMode('orbit')" :class="{ active: controlMode === 'orbit' }">軌道控制</button>
            <button @click="setControlMode('zoom')" :class="{ active: controlMode === 'zoom' }">縮放</button>
          </div>
          <div class="control-group">
            <button @click="resetView">重置視圖</button>
          </div>
        </div>
        <div class="camera-info">
          相機位置: X: {{ cameraPosition.x }}, Y: {{ cameraPosition.y }}, Z: {{ cameraPosition.z }}
        </div>
        <div v-if="modelError" class="error-message">{{ modelError }}</div>
        <div v-if="debugInfo" class="debug-info">{{ debugInfo }}</div>
        <button @click="closeModelPreview" class="close-button">關閉預覽</button>
      </div>

      <!-- 投票模態框 -->
      <div v-if="votingModalOpen" class="voting-modal">
        <h3>{{ currentVotingVote.title }}</h3>
        <form @submit.prevent="submitVote">
          <div v-for="option in currentVotingVote.options" :key="option.id" class="option-radio">
            <input type="radio" :id="option.id" :value="option.id" v-model="selectedOption">
            <label :for="option.id">{{ option.text }}</label>
          </div>
          <input v-model="voteReason" placeholder="請輸入投票理由（可選）" />
          <button type="submit" :disabled="!selectedOption">提交投票</button>
          <button type="button" @click="closeVotingModal">取消</button>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, onMounted, nextTick } from 'vue'
import { PDFDocument, rgb } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import axios from 'axios'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'

const API_URL = import.meta.env.VITE_APP_API_URL || 'http://localhost:3000/api'

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

export default defineComponent({
  name: 'VotingSystem',
  props: {
    title: {
      type: String,
      default: '投票系統'
    }
  },
  setup() {
    const nickname = ref('')
    const inputNickname = ref('')
    const pdfPreview = ref(null)
    const votes = ref([])
    const isCreatingVote = ref(false)
    const newVoteTitle = ref('')
    const newVoteOptions = ref([])
    const selected3dModelFile = ref(null)
    const selectedPdfFile = ref(null)
    const viewingPdf = ref(false)
    const viewing3dModel = ref(false)
    const viewingVoteDetails = ref(false)
    const currentVote = ref(null)
    const currentPdfId = ref(null)
    const pdfError = ref('')
    const modelError = ref('')
    const pdfDoc = ref(null)
    const currentPage = ref(1)
    const totalPages = ref(0)
    const votingModalOpen = ref(false)
    const currentVotingVote = ref(null)
    const selectedOption = ref(null)
    const voteReason = ref('')
    const userVotes = ref([])
    const modelContainer = ref(null)
    const debugInfo = ref('')
    const cameraPosition = ref({ x: 0, y: 0, z: 5 })
    const controlMode = ref('orbit')
    let controls

    const setNickname = () => {
      if (inputNickname.value.trim()) {
        nickname.value = inputNickname.value.trim()
        fetchVotes()
      }
    }

    const handlePdfUpload = (event) => {
      selectedPdfFile.value = event.target.files[0]
    }

    const handle3dModelUpload = (event) => {
      selected3dModelFile.value = event.target.files[0]
    }

    const addOption = () => {
      newVoteOptions.value.push({ text: '', reason: '' })
    }

    const removeOption = (index) => {
      newVoteOptions.value.splice(index, 1)
    }

    const createVote = async () => {
      if (newVoteTitle.value.trim() && newVoteOptions.value.length > 0) {
        try {
          const formData = new FormData()
          if (selectedPdfFile.value) {
            formData.append('pdf', selectedPdfFile.value)
          }
          if (selected3dModelFile.value) {
            formData.append('model', selected3dModelFile.value)
          }
          const uploadResponse = await axios.post(`${API_URL}/upload-files`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          })

          const newVote = {
            title: newVoteTitle.value.trim(),
            pdfFilename: uploadResponse.data.pdfFilename,
            objFilename: uploadResponse.data.objFilename,
            glbFilename: uploadResponse.data.glbFilename,
            options: newVoteOptions.value
          }

          const voteResponse = await axios.post(`${API_URL}/votes`, newVote)
          votes.value.push(voteResponse.data)
          newVoteTitle.value = ''
          newVoteOptions.value = []
          selectedPdfFile.value = null
          selected3dModelFile.value = null
          isCreatingVote.value = false
        } catch (error) {
          console.error('創建投票失敗:', error)
        }
      }
    }

    const cancelCreateVote = () => {
      isCreatingVote.value = false
      newVoteTitle.value = ''
      newVoteOptions.value = []
      selectedPdfFile.value = null
      selected3dModelFile.value = null
    }

    const fetchVotes = async () => {
      try {
        const response = await axios.get(`${API_URL}/votes`)
        votes.value = response.data
        const voteResponse = await axios.get(`${API_URL}/user-votes/${nickname.value}`)
        userVotes.value = voteResponse.data
      } catch (error) {
        console.error('獲取投票列表或用戶投票記錄失敗:', error)
      }
    }

    const viewVoteDetails = async (voteId) => {
      try {
        const response = await axios.get(`${API_URL}/vote-results/${voteId}`)
        currentVote.value = response.data
        viewingVoteDetails.value = true
      } catch (error) {
        console.error('獲取投票詳細資訊失敗:', error)
      }
    }

    const closeVoteDetails = () => {
      viewingVoteDetails.value = false
      currentVote.value = null
    }

    const viewPdf = async (voteId) => {
      // PDF 預覽邏輯保持不變
    }

    const view3dModel = async (voteId) => {
  debugInfo.value = '開始載入 3D 模型...'
  modelError.value = ''
  viewing3dModel.value = true
  
  await nextTick()
  
  if (!modelContainer.value) {
    debugInfo.value = '模型容器未找到'
    return
  }
  debugInfo.value = '模型容器已找到，開始設置場景...'
  try {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, modelContainer.value.clientWidth / modelContainer.value.clientHeight, 0.1, 1000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    
        // 設置背景為白色
        renderer.setClearColor(0xffffff, 1)
    renderer.setSize(modelContainer.value.clientWidth, modelContainer.value.clientHeight)
    modelContainer.value.appendChild(renderer.domElement)
    debugInfo.value = '場景已設置，開始載入模型...'
    
    const vote = votes.value.find(v => v.id === voteId)
    if (!vote || (!vote.objFilename && !vote.glbFilename)) {
      throw new Error('找不到對應的 3D 模型檔案')
    }
    
    let object
    if (vote.glbFilename) {
      const loader = new GLTFLoader()
      
      // 設置 DRACOLoader
      const dracoLoader = new DRACOLoader()
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
      loader.setDRACOLoader(dracoLoader)
      
      const gltf = await loader.loadAsync(`${API_URL}/glb/${vote.glbFilename}`)
      object = gltf.scene
    } else {
      const loader = new OBJLoader()
      const response = await fetch(`${API_URL}/obj/${vote.objFilename}`)
      const objText = await response.text()
      object = loader.parse(objText)
    }
    
    scene.add(object)
    
    debugInfo.value = '模型載入成功，添加到場景...'
    // 調整相機位置
    const box = new THREE.Box3().setFromObject(object)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = camera.fov * (Math.PI / 180)
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2))
    camera.position.z = cameraZ * 2
    camera.lookAt(center)

    // 添加浮水印
    const watermarkText = nickname.value
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = 512
    canvas.height = 512
    context.font = 'Bold 48px Arial'
    context.fillStyle = 'rgba(0,0,0,0.1)'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    
    // 在多個位置繪製水印，形成重複模式
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        context.fillText(watermarkText, i * 128, j * 128)
      }
    }
    const watermarkTexture = new THREE.CanvasTexture(canvas)
    const watermarkMaterial = new THREE.SpriteMaterial({ map: watermarkTexture, transparent: true })
    const watermarkSprite = new THREE.Sprite(watermarkMaterial)
    watermarkSprite.scale.set(maxDim, maxDim, 1)
    watermarkSprite.position.set(center.x, center.y, center.z)
    scene.add(watermarkSprite)

    // 設置控制器
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.25
    controls.screenSpacePanning = false
    controls.maxPolarAngle = Math.PI / 2

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0x404040, 2)
    scene.add(ambientLight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
    directionalLight.position.set(1, 1, 1)
    scene.add(directionalLight)

    // 渲染循環
    function animate() {
      requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
      // 更新相機位置狀態
      cameraPosition.value = {
        x: camera.position.x.toFixed(2),
        y: camera.position.y.toFixed(2),
        z: camera.position.z.toFixed(2)
      }
    }
    animate()

    // 添加視窗大小調整事件
    window.addEventListener('resize', onWindowResize, false)
    function onWindowResize() {
      camera.aspect = modelContainer.value.clientWidth / modelContainer.value.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(modelContainer.value.clientWidth, modelContainer.value.clientHeight)
    }
    debugInfo.value = '3D 模型渲染完成，浮水印已添加'
  } catch (error) {
    console.error('3D 模型處理錯誤:', error)
    modelError.value = `3D 模型預覽出現錯誤: ${error.message}`
    debugInfo.value = `錯誤詳情: ${error.stack}`
  }
}

    const closeModelPreview = () => {
      viewing3dModel.value = false
      if (modelContainer.value) {
        modelContainer.value.innerHTML = ''
      }
      debugInfo.value = ''
    }
    const closePreview = () => {
      viewingPdf.value = false
      currentPdfId.value = null
      pdfDoc.value = null
      currentPage.value = 1
      totalPages.value = 0
    }
    const previousPage = () => {
      if (currentPage.value > 1) {
        currentPage.value--
        renderPage()
      }
    }
    const nextPage = () => {
      if (currentPage.value < totalPages.value) {
        currentPage.value++
        renderPage()
      }
    }

    const setControlMode = (mode) => {
      controlMode.value = mode
      if (controls) {
        switch (mode) {
          case 'orbit':
            controls.mouseButtons = {
              LEFT: THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.PAN
            }
            break
          case 'zoom':
            controls.mouseButtons = {
              LEFT: THREE.MOUSE.DOLLY,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.ROTATE
            }
            break
        }
      }
    }

    const resetView = () => {
      if (controls) {
        controls.reset()
      }
    }

    const openVotingModal = (vote) => {
      currentVotingVote.value = vote
      votingModalOpen.value = true
      selectedOption.value = null
      voteReason.value = ''
    }

    const closeVotingModal = () => {
      votingModalOpen.value = false
      currentVotingVote.value = null
      selectedOption.value = null
      voteReason.value = ''
    }

    const submitVote = async () => {
      if (!selectedOption.value) return

      try {
        const response = await axios.post(`${API_URL}/cast-vote`, {
          userId: nickname.value,
          voteId: currentVotingVote.value.id,
          optionId: selectedOption.value,
          reason: voteReason.value
        })
        console.log(response.data.message)
        userVotes.value.push(currentVotingVote.value.id)  // 添加到已投票列表
        closeVotingModal()
        fetchVotes() // 重新獲取投票列表以更新數據
      } catch (error) {
        console.error('投票失敗:', error)
        // 這裡可以添加錯誤處理，比如顯示錯誤消息給用戶
      }
    }

    const hasVoted = (voteId) => {
      return userVotes.value.includes(voteId)
    }

    onMounted(() => {
      if (nickname.value) {
        fetchVotes()
      }
    })

    return {
      nickname,
      inputNickname,
      setNickname,
      pdfPreview,
      votes,
      isCreatingVote,
      newVoteTitle,
      newVoteOptions,
      handlePdfUpload,
      handle3dModelUpload,
      createVote,
      cancelCreateVote,
      viewPdf,
      view3dModel,
      closePreview,
      closeModelPreview,
      castVote: submitVote,
      selectedPdfFile,
      selected3dModelFile,
      viewingPdf,
      viewing3dModel,
      viewingVoteDetails,
      currentVote,
      pdfError,
      modelError,
      currentPage,
      totalPages,
      previousPage,
      nextPage,
      addOption,
      removeOption,
      viewVoteDetails,
      closeVoteDetails,
      votingModalOpen,
      currentVotingVote,
      selectedOption,
      voteReason,
      openVotingModal,
      closeVotingModal,
      submitVote,
      hasVoted,
      userVotes,
      modelContainer,
      debugInfo,
      cameraPosition,
      controlMode,
      setControlMode,
      resetView
    }
  }
})
</script>

<style scoped>
.voting-system {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

h1, h2 {
  color: #333;
}

input, button {
  margin: 10px 0;
  padding: 8px 12px;
  font-size: 16px;
}

button {
  background-color: #4CAF50;
  color: white;
  border: none;
  cursor: pointer;
  transition: background-color 0.3s;
}

button:hover {
  background-color: #45a049;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.pdf-preview, .model-preview {
  margin: 20px 0;
  border: 1px solid #ccc;
  padding: 10px;
}

.pdf-container, .model-container {
  width: 100%;
  height: 600px;
  overflow: auto;
  border: 1px solid #ccc;
  margin-bottom: 10px;
}

ul {
  list-style-type: none;
  padding: 0;
}

.vote-item {
  margin: 15px 0;
  padding: 10px;
  background-color: #f9f9f9;
  border-radius: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.vote-title {
  font-weight: bold;
}

.vote-count {
  color: #666;
}

.vote-actions {
  display: flex;
  gap: 10px;
}

.create-vote input[type="file"] {
  display: block;
  margin: 10px 0;
}

.option-input {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.error-message {
  color: red;
  margin-top: 10px;
}

.pdf-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
}

.vote-details {
  margin-top: 20px;
}

.option-detail {
  margin-bottom: 15px;
  padding: 10px;
  background-color: #f0f0f0;
  border-radius: 5px;
}

.option-text {
  font-weight: bold;
}

.option-votes, .option-percentage {
  display: inline-block;
  margin-right: 15px;
}

.option-reason {
  margin-top: 5px;
  font-style: italic;
}

.voting-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: white;
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.option-radio {
  margin-bottom: 10px;
}

.option-radio input[type="radio"] {
  margin-right: 10px;
}

.voted-label {
  color: #888;
  font-style: italic;
}

.model-preview {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.model-container {
  width: 80%;
  height: 70%;
  background-color: #f0f0f0;
  border-radius: 5px;
  overflow: hidden;
}

.model-controls {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-group {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.model-controls button {
  padding: 8px 15px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.3s, transform 0.1s;
}

.model-controls button:hover {
  background-color: #45a049;
  transform: translateY(-2px);
}

.model-controls button.active {
  background-color: #357a38;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15);
}

.camera-info {
  margin-top: 10px;
  color: white;
  font-size: 14px;
}

.close-button {
  position: absolute;
  top: 20px;
  right: 20px;
  padding: 10px 20px;
  background-color: #f44336;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.close-button:hover {
  background-color: #d32f2f;
}

.error-message, .debug-info {
  color: white;
  margin-top: 10px;
  max-width: 80%;
  word-wrap: break-word;
}
</style>
