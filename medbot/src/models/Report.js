import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  reportType: {
    type: String,
    enum: ['chest', 'fracture'],
    required: true,
  },
  predictedClass: {
    type: String,
    required: true,
  },
  confidenceScore: {
    type: Number,
    required: true,
  },
  imageURL: {
    type: String,
    required: true,
  },
  fractureLocation: {
    type: String,
    required: function() {
      return this.reportType === 'fracture';
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.models.Report || mongoose.model('Report', reportSchema);
