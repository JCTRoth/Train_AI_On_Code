"""
Hardware check utilities for AI training
"""

import psutil
import math
import os
import torch
from logger import get_logger

def get_available_ram_gb():
    """
    Get the amount of available RAM in GB
    
    Returns:
        float: Available RAM in GB
    """
    mem = psutil.virtual_memory()
    return mem.available / (1024 * 1024 * 1024)  # Convert bytes to GB

def get_total_ram_gb():
    """
    Get the total amount of RAM in GB
    
    Returns:
        float: Total RAM in GB
    """
    mem = psutil.virtual_memory()
    return mem.total / (1024 * 1024 * 1024)  # Convert bytes to GB

def get_used_ram_gb():
    """
    Get the amount of used RAM in GB
    
    Returns:
        float: Used RAM in GB
    """
    mem = psutil.virtual_memory()
    return mem.used / (1024 * 1024 * 1024)  # Convert bytes to GB

def check_ram_requirements(model_key, training_args):
    """
    Check if there's enough RAM available for the selected model
    
    Args:
        model_key: Key for model configuration in training_args.model_configs
        training_args: Training arguments module
        
    Returns:
        tuple: (bool, str) - (has_enough_ram, message)
    """
    # Get model config
    model_config = training_args.model_configs.get(model_key, training_args.model_configs[training_args.default_model])
    
    # Estimate RAM requirements based on model size
    # These are rough estimates and can be adjusted based on actual measurements
    model_size_estimates = {
        'phi-2': 6.0,  # ~6GB for Phi-2 model (2.7B parameters)
        'phi-1_5': 3.0,  # ~3GB for Phi-1.5 model (1.3B parameters)
    }
    
    # Extract base model name for size estimation
    parts = model_key.split('-')
    if len(parts) >= 2:
        base_model = parts[0] + '-' + parts[1]
    else:
        base_model = model_key
    
    # Default to Phi-2 size if unknown
    estimated_model_size = model_size_estimates.get(base_model, model_size_estimates['phi-2'])
    
    # If using quantization, reduce the estimated size
    if model_config.get('quantize', False):
        bits = model_config.get('bits', 8)
        reduction_factor = bits / 32  # FP32 is the reference
        estimated_model_size *= reduction_factor
    
    # Add overhead for tokenizer, optimizer, gradients, etc.
    overhead = 2.0  # ~2GB for overhead
    
    # Add overhead for batch size and gradient accumulation
    batch_memory = (training_args.per_device_train_batch_size * 
                   training_args.gradient_accumulation_steps * 
                   0.5)  # ~0.5GB per accumulated sample
    
    # Total estimated memory requirement
    total_required = estimated_model_size + overhead + batch_memory
    
    # Get available RAM
    available_ram = get_available_ram_gb()
    total_ram = get_total_ram_gb()
    
    # Check if there's enough RAM
    has_enough_ram = available_ram >= total_required
    
    # Create message
    message = (
        f"RAM Check:\n"
        f"  - Total RAM: {total_ram:.2f} GB\n"
        f"  - Available RAM: {available_ram:.2f} GB\n"
        f"  - Estimated requirements: {total_required:.2f} GB\n"
        f"    * Model: {estimated_model_size:.2f} GB\n"
        f"    * Overhead: {overhead:.2f} GB\n"
        f"    * Batch memory: {batch_memory:.2f} GB\n"
    )
    
    if has_enough_ram:
        message += f"  - Status: SUFFICIENT RAM AVAILABLE"
    else:
        message += (
            f"  - Status: INSUFFICIENT RAM\n"
            f"  - Shortfall: {total_required - available_ram:.2f} GB\n"
            f"  - Recommendation: "
        )
        
        # Provide recommendations
        if not model_config.get('quantize', False):
            message += "Use quantized model (--model phi-2-quantized), "
        
        if training_args.gradient_accumulation_steps < 8:
            message += f"Increase gradient accumulation (--gradient-accumulation 8+), "
            
        if training_args.max_seq_length > 256:
            message += f"Reduce max sequence length (--max-seq-length 256), "
        
        message += "or free up memory by closing other applications."
    
    return has_enough_ram, message

def print_system_info():
    """Print system information including CPU and RAM"""
    cpu_count = psutil.cpu_count(logical=False)
    cpu_count_logical = psutil.cpu_count(logical=True)
    cpu_freq = psutil.cpu_freq()
    
    if cpu_freq:
        cpu_freq_current = f"{cpu_freq.current:.2f} MHz"
        cpu_freq_max = f"{cpu_freq.max:.2f} MHz" if cpu_freq.max else "Unknown"
    else:
        cpu_freq_current = "Unknown"
        cpu_freq_max = "Unknown"
    
    total_ram = get_total_ram_gb()
    available_ram = get_available_ram_gb()
    used_ram = get_used_ram_gb()
    
    info = (
        f"System Information:\n"
        f"  - CPU: {cpu_count} physical cores, {cpu_count_logical} logical cores\n"
        f"  - CPU Frequency: Current: {cpu_freq_current}, Max: {cpu_freq_max}\n"
        f"  - RAM: {total_ram:.2f} GB total, {used_ram:.2f} GB used, {available_ram:.2f} GB available\n"
        f"  - Memory Usage: {psutil.virtual_memory().percent}%\n"
    )
    
    # Add GPU information if available
    if torch.cuda.is_available():
        gpu_count = torch.cuda.device_count()
        info += f"  - GPU: {gpu_count} available\n"
        
        for i in range(gpu_count):
            gpu_name = torch.cuda.get_device_name(i)
            info += f"    * GPU {i}: {gpu_name}\n"
    else:
        info += "  - GPU: Not available\n"
    
    get_logger().info(info)
    return info

def limit_cpu_usage():
    """
    Limit CPU usage to N-1 cores to prevent system lockup
    """
    # Get the number of available CPUs
    num_cpus = psutil.cpu_count(logical=True)
    
    # Set the number of threads for various libraries
    if num_cpus > 1:
        limit_to = num_cpus - 1
        
        # Set environment variables for CPU limits
        os.environ["OMP_NUM_THREADS"] = str(limit_to)
        os.environ["MKL_NUM_THREADS"] = str(limit_to)
        
        # Limit PyTorch threads
        if hasattr(torch, 'set_num_threads'):
            torch.set_num_threads(limit_to)
            
        get_logger().info(f"Limited CPU usage to {limit_to} cores (of {num_cpus} available)")
    else:
        get_logger().info("Not limiting CPU usage as only 1 core is available")
