# Software-Engineering-Project && Minor Project

This repository contains the Software Requirements Specification (SRS), design artifacts, and implementation resources for an **AI-Powered Medical Chatbot for Disease Diagnosis and Prescription using Chest X-Ray Images**.  
The system now ships with a dual-model inference stack:

- A **Pytorch CNN Chest model** that classifies chest X-rays into _Normal_, _Pneumonia_, _COVID-19_, or _Lung Opacity_.
- A **PyTorch-based MURA fracture model** (under `model1/`) that localises upper-limb fractures (_XR_ELBOW, XR_FINGER, XR_FOREARM, XR_HAND, XR_HUMERUS, XR_SHOULDER, XR_WRIST_).

Both models feed a unified UI + report/chat experience so clinicians can switch between Chest and Fracture workflows seamlessly.

## 📌 Project Overview

The project aims to improve accessibility to medical diagnostic support by integrating machine learning, medical imaging, and conversational AI. It assists users in:

- Uploading chest X-ray images
- Receiving AI-driven diagnostic results
- Interacting with a chatbot for interpretation and guidance
- Accessing downloadable diagnostic reports
- Receiving notifications regarding diagnosis completion

## 🏗️ System Features

- Image upload and validation
- Automated preprocessing
- Deep learning-based diagnosis (Chest + MURA Fracture)
- Chatbot interaction module
- Report generation
- User and admin management

## 🗂️ Repository Contents

- `/DFD` – DFD diagrams
- `/SRS` – SRS
- `/UML` – UML diagrams
- `/medbot` – Full interactive UI wired to the inference APIs
- `/model` – Legacy TensorFlow chest model training + inference scripts
- `/model1` – PyTorch MURA fracture detection pipeline (`pipeline_mura.py`, `mura_bodypart_model.pth`)

## 🛠️ Tech Stack

- **Frontend:** React / Next.js 16
- **Backend:** Next.js API routes + Node.js
- **Deep Learning:** PyTorch(Chest CNN), PyTorch (MURA Fracture)
- **Database:** MongoDB
- **OS:** Windows 11

## 🦴 MURA Fracture Model (`model1/`)

The `model1` folder packages the fracture workflow:

1. `pipeline_mura.py` – entry script invoked by the app (`/api/predict-smart`) for inference.
2. `mura_bodypart_model.pth` – fine-tuned PyTorch weights on the MURA dataset.
3. Pre-/post-processing utilities to resize, normalise, and map predictions to fracture labels.

**Running the fracture model manually**

```bash
cd model1
python pipeline_mura.py ../medbot/public/uploads/sample_fracture.png
```

The script prints JSON `{ "predicted_class": "...", "probabilities": [...] }` consumed by the MEDBOT UI. Ensure Python environment mirrors the dependencies described in `model1/requirements.txt` (PyTorch, torchvision, Pillow, etc.).

**Integration notes**

- The UI sends `reportType` with each upload (Chest/Fracture).
- `/api/predict-smart` now respects this flag and only executes the requested model, falling back to dual-mode auto-detection when unset.
- Saved reports include `fractureLocation` so history and analytics can distinguish body parts.

## 📥 Dataset

Chest X-ray and MURA dataset for training and evaluation are sourced from Kaggle.

## 🧪 Testing

Includes:

- Unit tests for model and backend
- Integration tests for full pipeline
- UI tests for chatbot and upload interface

## 🤝 Contributors

- Arnav Singh 23106054
- Aekam Singh Sidhu 23106060
- Harshit 23106057
- Vivek 23106035

---
