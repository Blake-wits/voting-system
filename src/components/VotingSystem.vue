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
      <div v-if="!isCreatingVote && !viewingPdf && !viewingVoteDetails" class="vote-list">
        <h2>當前投票</h2>
        <ul>
          <li v-for="vote in votes" :key="vote.id" class="vote-item">
            <div class="vote-title">{{ vote.title }}</div>
            <div class="vote-count">票數: {{ vote.totalVotes }}</div>
            <div class="vote-actions">
              <button @click="viewPdf(vote.id)">查看 PDF</button>
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
        <input type="file" @change="handleFileUpload" accept="application/pdf" />
        <div v-for="(option, index) in newVoteOptions" :key="index" class="option-input">
          <input v-model="option.text" placeholder="選項內容" />
          <input v-model="option.reason" placeholder="選項理由" />
          <button @click="removeOption(index)">移除選項</button>
        </div>
        <button @click="addOption">新增選項</button>
        <button @click="createVote" :disabled="!newVoteTitle || !selectedFile || newVoteOptions.length === 0">確認建立</button>
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
import { PDFDocument, rgb, degrees } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import axios from 'axios'

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
    const selectedFile = ref(null)
    const viewingPdf = ref(false)
    const viewingVoteDetails = ref(false)
    const currentVote = ref(null)
    const currentPdfId = ref(null)
    const pdfError = ref('')
    const pdfDoc = ref(null)
    const currentPage = ref(1)
    const totalPages = ref(0)
    const votingModalOpen = ref(false)
    const currentVotingVote = ref(null)
    const selectedOption = ref(null)
    const voteReason = ref('')
    const userVotes = ref([])

    const setNickname = () => {
      if (inputNickname.value.trim()) {
        nickname.value = inputNickname.value.trim()
        fetchVotes()
      }
    }

    const handleFileUpload = (event) => {
      selectedFile.value = event.target.files[0]
    }

    const addOption = () => {
      newVoteOptions.value.push({ text: '', reason: '' })
    }

    const removeOption = (index) => {
      newVoteOptions.value.splice(index, 1)
    }

    const createVote = async () => {
      if (newVoteTitle.value.trim() && selectedFile.value && newVoteOptions.value.length > 0) {
        try {
          const formData = new FormData()
          formData.append('pdf', selectedFile.value)
          const uploadResponse = await axios.post(`${API_URL}/upload-pdf`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          })

          const newVote = {
            title: newVoteTitle.value.trim(),
            pdfFilename: uploadResponse.data.filename,
            options: newVoteOptions.value
          }

          const voteResponse = await axios.post(`${API_URL}/votes`, newVote)
          votes.value.push(voteResponse.data)
          newVoteTitle.value = ''
          newVoteOptions.value = []
          selectedFile.value = null
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
      selectedFile.value = null
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
      pdfError.value = ''
      const vote = votes.value.find(v => v.id === voteId)
      if (vote && vote.pdfFilename) {
        try {
          console.log('開始獲取 PDF')
          const response = await axios.get(`${API_URL}/pdf/${vote.pdfFilename}`, { 
            responseType: 'arraybuffer' 
          })
          const pdfBytes = new Uint8Array(response.data)
          
          console.log('開始處理 PDF')
          pdfDoc.value = await PDFDocument.load(pdfBytes)
          console.log('PDF 載入成功')
          const pages = pdfDoc.value.getPages()
          totalPages.value = pages.length
          console.log(`PDF 頁數: ${totalPages.value}`)
          
          pages.forEach((page, index) => {
            const { width, height } = page.getSize()
            console.log(`第 ${index + 1} 頁尺寸: ${width}x${height}`)
            
            // 設置浮水印參數
            const watermarkText = nickname.value
            const fontSize = 20
            const opacity = 0.1
            const rotationAngle = 45
            
            // 計算浮水印的間距
            const spacingX = 150
            const spacingY = 150
            
            // 在整個頁面上重複添加浮水印
            for (let y = 0; y < height; y += spacingY) {
              for (let x = 0; x < width; x += spacingX) {
                page.drawText(watermarkText, {
                  x: x,
                  y: y,
                  size: fontSize,
                  color: rgb(0.95, 0.1, 0.1),
                  opacity: opacity,
                  rotate: degrees(rotationAngle),
                })
              }
            }
          })
          
          console.log('浮水印添加完成')
          viewingPdf.value = true
          currentPdfId.value = voteId
          currentPage.value = 1
          await nextTick()
          renderPage()
        } catch (error) {
          console.error('PDF處理錯誤:', error)
          pdfError.value = `PDF 預覽出現錯誤: ${error.message}`
        }
      } else {
        pdfError.value = '找不到對應的 PDF 文件'
      }
    }

    const renderPage = async () => {
      if (!pdfDoc.value) return
  
      const pdfBytes = await pdfDoc.value.save()
      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes })
      
      try {
        const pdf = await loadingTask.promise
        const page = await pdf.getPage(currentPage.value)
        const scale = 1.5
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        canvas.height = viewport.height
        canvas.width = viewport.width

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        }

        await page.render(renderContext).promise

        const pdfPreviewElement = pdfPreview.value
        if (pdfPreviewElement) {
          pdfPreviewElement.innerHTML = ''
          pdfPreviewElement.appendChild(canvas)
        } else {
          console.error('PDF 預覽容器未找到')
        }
      } catch (error) {
        console.error('渲染 PDF 頁面時出錯:', error)
        pdfError.value = `渲染 PDF 頁面時出錯: ${error.message}`
      }
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

    const closePreview = () => {
      viewingPdf.value = false
      currentPdfId.value = null
      pdfDoc.value = null
      currentPage.value = 1
      totalPages.value = 0
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
      handleFileUpload,
      createVote,
      cancelCreateVote,
      viewPdf,
      closePreview,
      castVote: submitVote,
      selectedFile,
      viewingPdf,
      viewingVoteDetails,
      currentVote,
      pdfError,
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
      userVotes
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

.pdf-preview {
  margin: 20px 0;
  border: 1px solid #ccc;
  padding: 10px;
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

.pdf-container {
  width: 100%;
  height: 600px;
  overflow: auto;
  border: 1px solid #ccc;
  margin-bottom: 10px;
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
</style>