def lambda_handler(event, context):
    inputs_obj_dict = event['inputs']
    jobs_finished = int(inputs_obj_dict['next_execution_array_size'] if 'next_execution_array_size' in inputs_obj_dict else 0)
    new_num_slices = int(inputs_obj_dict['num_slices']) - jobs_finished
    max_batch_jobs = int(inputs_obj_dict['max_batch_jobs'])
    return {
        'statusCode': 200,
        'inputs': {
            'n': inputs_obj_dict['n'],
            'commands': inputs_obj_dict['commands'],
            's3_bucket': inputs_obj_dict['s3_bucket'],
            'num_slices': new_num_slices,
            'max_batch_jobs': max_batch_jobs,
            'args_path': inputs_obj_dict['args_path'],
            'line': str(int(inputs_obj_dict['line'] if 'line' in inputs_obj_dict else 1) + jobs_finished), # line = 1 on first execution
            'next_execution_array_size': min(max_batch_jobs,new_num_slices)
        }
    }
