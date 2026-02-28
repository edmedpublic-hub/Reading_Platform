from django.http import JsonResponse

def check_auth(request):
    return JsonResponse({'authenticated': request.user.is_authenticated})