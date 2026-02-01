import torch
import numpy as np
from tqdm.auto import tqdm
from logger import get_logger
import math
from torch.utils.data import DataLoader


class ModelEvaluator:
    """
    Class to evaluate language model performance on a dataset
    """
    def __init__(self, model, tokenizer, eval_dataset, max_length=512, batch_size=4):
        self.model = model
        self.tokenizer = tokenizer
        self.eval_dataset = eval_dataset
        self.max_length = max_length
        self.batch_size = batch_size
        self.device = next(model.parameters()).device
        
    def _prepare_batch(self, batch):
        """Prepare a batch of inputs for evaluation"""
        if isinstance(batch, dict):
            # Move inputs to the same device as the model
            processed_inputs = {}
            for k, v in batch.items():
                if k == 'labels' and isinstance(v, list):
                    # Convert list to tensor
                    processed_inputs[k] = torch.tensor(v).to(self.device)
                else:
                    processed_inputs[k] = v.to(self.device)
            return processed_inputs
        else:
            # Handle individual batch items
            try:
                input_texts = [sample.content for sample in batch]
            except AttributeError:
                # If content attribute doesn't exist, convert to string
                input_texts = [str(sample) for sample in batch]
            
            # Tokenize inputs
            inputs = self.tokenizer(
                input_texts, 
                return_tensors="pt", 
                padding="max_length",
                truncation=True,
                max_length=self.max_length
            )
            
            # Move inputs to the same device as the model
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Set labels for causal language modeling
            inputs["labels"] = inputs["input_ids"].clone()
            
            return inputs
    
    def evaluate(self):
        """
        Evaluate the model on the evaluation dataset
        
        Returns:
            Dict containing perplexity and average loss
        """
        get_logger().info("Starting model evaluation...")
        
        # Set model to evaluation mode
        self.model.eval()
        
        total_loss = 0
        total_tokens = 0
        
        eval_loader = DataLoader(self.eval_dataset, batch_size=self.batch_size, shuffle=False)

        with torch.no_grad():
            for batch in eval_loader:
                try:
                    # Prepare inputs
                    inputs = self._prepare_batch(batch)
                    
                    # Forward pass
                    outputs = self.model(**inputs)
                    loss = outputs.loss
                    
                    # Get number of tokens
                    attention_mask = inputs.get("attention_mask")
                    num_tokens = attention_mask.sum().item() if attention_mask is not None else inputs["input_ids"].numel()
                    
                    # Update totals
                    total_loss += loss.item() * num_tokens
                    total_tokens += num_tokens
                    
                except Exception as e:
                    get_logger().error(f"Error during evaluation: {str(e)}")
                    continue
        
        # Calculate metrics
        avg_loss = total_loss / total_tokens if total_tokens > 0 else float('inf')
        perplexity = math.exp(avg_loss)
        
        # Set model back to training mode
        self.model.train()
        
        get_logger().info(f"Evaluation complete - Loss: {avg_loss:.4f}, Perplexity: {perplexity:.2f}")
        
        return {
            "loss": avg_loss,
            "perplexity": perplexity
        }


class EarlyStopping:
    """
    Early stopping handler to prevent overfitting
    """
    def __init__(self, patience=3, threshold=0.01):
        self.patience = patience
        self.threshold = threshold
        self.best_loss = float('inf')
        self.counter = 0
        self.should_stop = False
    
    def __call__(self, current_loss):
        """
        Check if training should stop based on validation loss
        
        Args:
            current_loss: The current validation loss
            
        Returns:
            bool: True if training should stop, False otherwise
        """
        if current_loss < self.best_loss * (1 - self.threshold):
            # Improvement found
            self.best_loss = current_loss
            self.counter = 0
            get_logger().info(f"Early stopping - New best loss: {current_loss:.4f}")
            return False
        else:
            # No significant improvement
            self.counter += 1
            get_logger().info(f"Early stopping - No improvement for {self.counter}/{self.patience} evaluations")
            
            if self.counter >= self.patience:
                get_logger().info("Early stopping triggered - stopping training")
                self.should_stop = True
                return True
            
            return False
